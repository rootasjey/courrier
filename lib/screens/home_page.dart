import "package:beamer/beamer.dart";
import "package:cloud_firestore/cloud_firestore.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:courrier/router/locations/messages_content_location.dart";
import "package:courrier/screens/home_page/message_list_view.dart";
import "package:courrier/types/alias/firestore/document_change_map.dart";
import "package:courrier/types/alias/firestore/query_map.dart";
import "package:courrier/types/alias/firestore/query_snap_map.dart";
import "package:courrier/types/alias/firestore/query_snapshot_stream_subscription.dart";
import "package:courrier/types/alias/json_alias.dart";
import "package:courrier/types/contact.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:courrier/types/enums/enum_page_state.dart";
import "package:courrier/types/message.dart";
import "package:flutter/material.dart";
import "package:loggy/loggy.dart";

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    this.pageDataFilter = PageDataFilter.inbox,
    this.selectedMessageId = "",
  });

  /// Tell us which type of data to fetch (e.g. inbox, arvhied, deleted, ...).
  final PageDataFilter pageDataFilter;

  final String selectedMessageId;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with UiLoggy {
  final _beamerKey = GlobalKey<BeamerState>(debugLabel: "message-beamer-key");

  /// True if there're more posts to fetch.
  bool _hasNext = true;

  /// Last document fetched from Firestore.
  DocumentSnapshot? _lastDocument;

  /// Maximum posts fetch per page.
  final int _limit = 10;

  /// Project list. This is the main page content.
  final List<Message> _messages = [];

  /// Listens to posts' updates.
  QuerySnapshotStreamSubscription? _messageSubscription;

  /// Firestore collection name.
  final String _collectionName = "messages";

  /// Map of contacts.
  final Map<String, Contact> _contactMap = {};

  /// Selected message.
  Message _selectedMessage = Message.empty();

  PageState _pageState = PageState.idle;

  final BeamerDelegate _beamerDelegate = BeamerDelegate(
    locationBuilder: (routeInformation, _) =>
        MessagesContentLocation(routeInformation),
  );

  @override
  void initState() {
    super.initState();
    _beamerDelegate.addListener(listenToRoute);
    tryFetchMessages();
  }

  @override
  void dispose() {
    _lastDocument = null;
    _messageSubscription?.cancel();
    _beamerDelegate.removeListener(listenToRoute);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          MessageListView(
            messages: _messages,
            contactMap: _contactMap,
            onTapMessage: onTapMessage,
            selectedMessage: _selectedMessage,
            pageDataFilter: widget.pageDataFilter,
            pageState: _pageState,
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(0.0),
              child: Material(
                child: Beamer(
                  key: _beamerKey,
                  routerDelegate: _beamerDelegate,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void definitivelyDeleteMessage() async {
    setState(() {
      _pageState = PageState.deletingMessage;
    });

    try {
      await FirebaseFirestore.instance
          .collection("deleted_messages")
          .doc(_selectedMessage.id)
          .delete();

      if (!mounted) {
        return;
      }

      setState(() {
        _pageState = PageState.idle;
      });
    } catch (error) {
      loggy.error(error);
      setState(() {
        _pageState = PageState.idle;
      });
    }
  }

  /// Return the query to retrieve messages
  /// and to listen changes to.
  QueryMap getFirestoreQuery() {
    final DocumentSnapshot? lastDocument = _lastDocument;
    QueryMap queryResult;

    switch (widget.pageDataFilter) {
      case PageDataFilter.archived:
        queryResult = FirebaseFirestore.instance
            .collection("archived_messages")
            .orderBy("created_at", descending: true)
            .limit(_limit);
        break;
      case PageDataFilter.deleted:
        queryResult = FirebaseFirestore.instance
            .collection("deleted_messages")
            .orderBy("created_at", descending: true)
            .limit(_limit);
        break;
      case PageDataFilter.flagged:
        queryResult = FirebaseFirestore.instance
            .collection(_collectionName)
            .orderBy("created_at", descending: true)
            .where("is_flagged", isEqualTo: true)
            .limit(_limit);
        break;
      case PageDataFilter.inbox:
        queryResult = FirebaseFirestore.instance
            .collection(_collectionName)
            .orderBy("created_at", descending: true)
            .limit(_limit);
        break;
      default:
        queryResult = FirebaseFirestore.instance
            .collection(_collectionName)
            .orderBy("created_at", descending: true)
            .limit(_limit);
        break;
    }

    if (lastDocument != null) {
      queryResult = queryResult.startAfterDocument(lastDocument);
    }

    return queryResult;
  }

  void listenToProjectEvents(QueryMap? query) {
    if (query == null) {
      return;
    }

    _messageSubscription?.cancel();
    _messageSubscription = query.snapshots().skip(1).listen(
      (snapshot) {
        for (DocumentChangeMap documentChange in snapshot.docChanges) {
          switch (documentChange.type) {
            case DocumentChangeType.added:
              onAddStreamingMessage(documentChange);
              break;
            case DocumentChangeType.modified:
              onUpdateStreamingMessage(documentChange);
              break;
            case DocumentChangeType.removed:
              onRemoveStreamingMessage(documentChange);
              break;
          }
        }
      },
      onError: (error) {
        loggy.error(error);
      },
    );
  }

  /// Fire when a new document has been created in Firestore.
  /// Add the corresponding document in the UI.
  void onAddStreamingMessage(DocumentChangeMap documentChange) {
    final Json? data = documentChange.doc.data();

    if (data == null) {
      return;
    }

    if (!mounted) {
      return;
    }

    setState(() {
      data["id"] = documentChange.doc.id;
      final Message message = Message.fromMap(data);
      _messages.insert(0, message);
    });
  }

  void onArchiveMessage() async {
    setState(() {
      _pageState = PageState.archivingMessage;
    });

    try {
      await FirebaseFirestore.instance
          .collection("archived_messages")
          .doc(_selectedMessage.id)
          .set(_selectedMessage.toMap());

      await FirebaseFirestore.instance
          .collection(_collectionName)
          .doc(_selectedMessage.id)
          .delete();

      if (!mounted) {
        return;
      }

      setState(() {
        _pageState = PageState.idle;
        _selectedMessage = Message.empty();
      });
    } catch (error) {
      loggy.error(error);
      setState(() {
        _pageState = PageState.idle;
      });
    }
  }

  void onDeleteMessage() async {
    if (widget.pageDataFilter == PageDataFilter.deleted) {
      return definitivelyDeleteMessage();
    }

    return moveMessageToTrash();
  }

  void moveMessageToTrash() async {
    setState(() {
      _pageState = PageState.deletingMessage;
    });

    try {
      await FirebaseFirestore.instance
          .collection("deleted_messages")
          .doc(_selectedMessage.id)
          .set(_selectedMessage.toMap());

      await FirebaseFirestore.instance
          .collection(_collectionName)
          .doc(_selectedMessage.id)
          .delete();

      if (!mounted) {
        return;
      }

      setState(() {
        _pageState = PageState.idle;
      });
    } catch (error) {
      loggy.error(error);
      setState(() {
        _pageState = PageState.idle;
      });
    }
  }

  void onFlagMessage() async {
    final bool isFlagged = !_selectedMessage.isFlagged;

    setState(() {
      _selectedMessage = _selectedMessage.copyWith(
        isFlagged: isFlagged,
      );
    });

    try {
      await FirebaseFirestore.instance
          .collection(_collectionName)
          .doc(_selectedMessage.id)
          .update({"is_flagged": isFlagged});
    } catch (error) {
      loggy.error(error);

      setState(() {
        _selectedMessage = _selectedMessage.copyWith(
          isFlagged: !isFlagged,
        );
      });
    }
  }

  void onTapMessage(Message message, Contact contact) {
    if (message.id == _selectedMessage.id) {
      _beamerDelegate.beamToReplacementNamed(LayoutContentLocation.inboxRoute);

      setState(() {
        _selectedMessage = Message.empty();
      });

      return;
    }

    setState(() {
      _selectedMessage = message;
    });

    final route = MessagesContentLocation.messageRoute.replaceFirst(
      ":messageId",
      message.id,
    );

    Beamer.of(context).beamToNamed(
      route,
      data: {"messageId": message.id},
      routeState: {
        "filter": widget.pageDataFilter.index,
      },
    );
  }

  void onUnselectMessage() {
    setState(() {
      _selectedMessage = Message.empty();
    });
  }

  /// Fire when a new document has been delete from Firestore.
  /// Delete the corresponding document from the UI.
  void onRemoveStreamingMessage(DocumentChangeMap documentChange) {
    setState(() {
      _messages.removeWhere(
        (Message message) => message.id == documentChange.doc.id,
      );
    });
  }

  /// Fire when a new document has been updated in Firestore.
  /// Update the corresponding document in the UI.
  void onUpdateStreamingMessage(DocumentChangeMap documentChange) async {
    try {
      final Json? data = documentChange.doc.data();
      if (data == null) {
        return;
      }

      final int index = _messages.indexWhere(
        (Message p) => p.id == documentChange.doc.id,
      );

      data["id"] = documentChange.doc.id;
      final updatedMessage = Message.fromMap(data);

      if (!mounted) {
        return;
      }

      setState(() {
        _messages.removeAt(index);
        _messages.insert(index, updatedMessage);
      });
    } on Exception catch (error) {
      loggy.error(
        "The document with the id ${documentChange.doc.id} "
        "doesn't exist in the project list.",
      );

      loggy.error(error);
    }
  }

  void tryFetchMessages() async {
    setState(() {
      _messages.clear();
      _pageState = PageState.loading;
    });

    try {
      final QueryMap query = getFirestoreQuery();
      final QuerySnapMap snapshot = await query.get();
      listenToProjectEvents(query);

      if (snapshot.size == 0) {
        setState(() {
          _hasNext = false;
          _pageState = PageState.idle;
        });

        return;
      }

      for (final doc in snapshot.docs) {
        final Json map = doc.data();
        map["id"] = doc.id;

        final Message message = Message.fromMap(map);
        _messages.add(message);

        final Contact contact = await tryFetchContact(message.contactId);
        if (contact.id.isNotEmpty) {
          _contactMap.putIfAbsent(contact.id, () => contact);
        }
      }

      setState(() {
        _lastDocument = snapshot.docs.last;
        _hasNext = _limit == snapshot.size;
        _pageState = PageState.idle;
      });
    } catch (error) {
      loggy.error(error);
      setState(() {
        _pageState = PageState.idle;
      });
    }
  }

  void tryFetchMoreMessages() async {
    final DocumentSnapshot? lastDocument = _lastDocument;
    if (!_hasNext || _pageState == PageState.loading || lastDocument == null) {
      return;
    }

    setState(() => _pageState = PageState.loading);

    try {
      final QueryMap query = getFirestoreQuery();
      listenToProjectEvents(query);

      final QuerySnapMap snapshot = await query.get();

      if (snapshot.size == 0) {
        setState(() {
          _hasNext = false;
          _pageState = PageState.idle;
        });

        return;
      }

      for (final doc in snapshot.docs) {
        final Json map = doc.data();
        map["id"] = doc.id;

        final Message message = Message.fromMap(map);
        _messages.add(message);

        final Contact contact = await tryFetchContact(message.contactId);
        if (contact.id.isNotEmpty) {
          _contactMap.putIfAbsent(contact.id, () => contact);
        }
      }

      setState(() {
        _pageState = PageState.idle;
        _lastDocument = snapshot.docs.last;
        _hasNext = _limit == snapshot.size;
      });
    } catch (error) {
      loggy.error(error);
      setState(() {
        _pageState = PageState.idle;
      });
    }
  }

  Future<Contact> tryFetchContact(String contactId) async {
    if (contactId.isEmpty || _contactMap.containsKey(contactId)) {
      return Contact.empty();
    }

    try {
      final doc = await FirebaseFirestore.instance
          .collection("contacts")
          .doc(contactId)
          .get();

      final Json? map = doc.data();

      if (!doc.exists || map == null) {
        return Contact.empty();
      }

      map["id"] = doc.id;
      return Contact.fromMap(map);
    } catch (error) {
      loggy.error(error);
      return Contact.empty();
    }
  }

  void listenToRoute() {
    final beamLocation = _beamerDelegate.beamingHistory.first;
    final String? location = beamLocation.state.routeInformation.location;
    if (location == null) {
      return;
    }

    if (location.contains("/messages")) {
      return;
    }

    setState(() {
      _selectedMessage = Message.empty();
    });
  }
}

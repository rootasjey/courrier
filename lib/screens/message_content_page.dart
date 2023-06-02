import "dart:async";

import "package:beamer/beamer.dart";
import "package:cloud_firestore/cloud_firestore.dart";
import "package:courrier/helpers.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:courrier/screens/messages_page/empty_content_view.dart";
import "package:courrier/screens/messages_page/content_view.dart";
import "package:courrier/types/alias/firestore/document_map.dart";
import "package:courrier/types/alias/firestore/document_snapshot_map.dart";
import "package:courrier/types/alias/json_alias.dart";
import "package:courrier/types/contact.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:courrier/types/enums/enum_page_state.dart";
import "package:courrier/types/message.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:loggy/loggy.dart";
import "package:lottie/lottie.dart";

class MessageContentPage extends StatefulWidget {
  const MessageContentPage({
    super.key,
    this.pageDataFilter = PageDataFilter.inbox,
    this.selectedMessageId = "",
  });

  /// Tell us which type of data to fetch (e.g. inbox, arvhied, deleted, ...).
  final PageDataFilter pageDataFilter;
  final String selectedMessageId;

  @override
  State<MessageContentPage> createState() => _MessageContentPageState();
}

class _MessageContentPageState extends State<MessageContentPage> with UiLoggy {
  /// Current selected contact;
  Contact _selectedContact = Contact.empty();

  /// Current selected message;
  Message _selectedMessage = Message.empty();

  /// Current page state.
  PageState _pageState = PageState.preLoading;

  /// Timer to set loading state with a delay.
  Timer? _loadingTimer;

  @override
  void initState() {
    super.initState();
    tryFetchMessage();
  }

  @override
  void dispose() {
    _loadingTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_pageState == PageState.preLoading) {
      return Container();
    }

    if (_pageState == PageState.loading) {
      return SizedBox(
        width: 300.0,
        child: Column(
          children: [
            Lottie.asset(
              "assets/animations/loading-mail.json",
              width: 290.0,
            ),
            Text(
              "${"loading".tr()}...",
              style: Helpers.fonts.body5(
                textStyle: const TextStyle(
                  fontWeight: FontWeight.w600,
                  // color: color?.withOpacity(0.6),
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_selectedMessage.id.isEmpty && _pageState == PageState.idle) {
      return EmptyContentView(
        pageDataFilter: widget.pageDataFilter,
      );
    }

    return ContentView(
      selectedMessage: _selectedMessage,
      selectedContact: _selectedContact,
      onUnselectMessage: onUnselectMessage,
      onArchiveMessage: onArchiveMessage,
      onDeleteMessage: onDeleteMessage,
      onFlagMessage: onFlagMessage,
      pageDataFilter: widget.pageDataFilter,
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
        onUnselectMessage();
      });
    } catch (error) {
      loggy.error(error);
      setState(() {
        _pageState = PageState.idle;
      });
    }
  }

  String getCollectionName() {
    switch (widget.pageDataFilter) {
      case PageDataFilter.archived:
        return "archived_messages";
      case PageDataFilter.deleted:
        return "deleted_messages";
      case PageDataFilter.inbox:
        return "messages";
      default:
        return "messages";
    }
  }

  String getTrashSourceCollectionName() {
    switch (widget.pageDataFilter) {
      case PageDataFilter.archived:
        return "archived_messages";
      case PageDataFilter.inbox:
        return "messages";
      default:
        return "messages";
    }
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
          .collection(getTrashSourceCollectionName())
          .doc(_selectedMessage.id)
          .delete();

      if (!mounted) {
        return;
      }

      setState(() {
        _pageState = PageState.idle;
        onUnselectMessage();
      });
    } catch (error) {
      loggy.error(error);
      setState(() {
        _pageState = PageState.idle;
      });
    }
  }

  void onArchiveMessage() async {
    if (widget.pageDataFilter != PageDataFilter.inbox) {
      return;
    }

    setState(() {
      _pageState = PageState.archivingMessage;
    });

    try {
      await FirebaseFirestore.instance
          .collection("archived_messages")
          .doc(_selectedMessage.id)
          .set(_selectedMessage.toMap());

      await FirebaseFirestore.instance
          .collection("messages")
          .doc(_selectedMessage.id)
          .delete();

      if (!mounted) {
        return;
      }

      setState(() {
        _pageState = PageState.idle;
        onUnselectMessage();
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

  void onFlagMessage() async {
    final bool isFlagged = !_selectedMessage.isFlagged;

    setState(() {
      _selectedMessage = _selectedMessage.copyWith(
        isFlagged: isFlagged,
      );
    });

    try {
      await FirebaseFirestore.instance
          .collection(getCollectionName())
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

  void onUnselectMessage() {
    setState(() {
      _selectedContact = Contact.empty();
      _selectedMessage = Message.empty();
    });

    Beamer.of(context).beamToNamed(LayoutContentLocation.inboxRoute);
  }

  Future<void> tryFetchMessage() async {
    if (widget.selectedMessageId.isEmpty) {
      setState(() => _pageState = PageState.idle);
      return;
    }

    _loadingTimer = Timer(const Duration(seconds: 2), () {
      setState(() {
        _pageState = PageState.loading;
      });
    });

    try {
      final DocumentMap doc = FirebaseFirestore.instance
          .collection(getCollectionName())
          .doc(widget.selectedMessageId);

      final DocumentSnapshotMap snapshot = await doc.get();
      final Json? map = snapshot.data();

      if (!snapshot.exists || map == null) {
        _loadingTimer?.cancel();
        setState(() => _pageState = PageState.idle);
        return;
      }

      map["id"] = snapshot.id;
      final Message message = Message.fromMap(map);
      final contact = await tryFetchContact(message.contactId);

      setState(() {
        _loadingTimer?.cancel();
        _selectedMessage = message;
        _selectedContact = contact;
        _pageState = PageState.idle;
      });
    } catch (error) {
      _loadingTimer?.cancel();
      setState(() => _pageState = PageState.idle);
      loggy.error(error);
    }
  }

  Future<Contact> tryFetchContact(String contactId) async {
    if (contactId.isEmpty) {
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
}

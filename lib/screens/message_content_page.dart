import "package:beamer/beamer.dart";
import "package:cloud_firestore/cloud_firestore.dart";
import "package:courrier/helpers.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:courrier/screens/home_page/empty_message_content_view.dart";
import "package:courrier/screens/home_page/message_content_view.dart";
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
  Message _selectedMessage = Message.empty();
  Contact _selectedContact = Contact.empty();

  PageState _pageState = PageState.loading;

  /// Firestore collection name.
  final String _collectionName = "messages";

  @override
  void initState() {
    super.initState();
    tryFetchMessage();
  }

  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
      return EmptyMessageContentView(
        pageDataFilter: widget.pageDataFilter,
      );
    }

    return MessageContentView(
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
      });
    } catch (error) {
      loggy.error(error);
      setState(() {
        _pageState = PageState.idle;
      });
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
        _selectedContact = Contact.empty();
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

    setState(() {
      _pageState = PageState.loading;
    });

    try {
      final doc = FirebaseFirestore.instance
          .collection(_collectionName)
          .doc(widget.selectedMessageId);

      final snapshot = await doc.get();
      final Json? map = snapshot.data();

      if (!snapshot.exists || map == null) {
        setState(() => _pageState = PageState.idle);

        return;
      }

      map["id"] = snapshot.id;
      final Message message = Message.fromMap(map);
      final contact = await tryFetchContact(message.contactId);

      setState(() {
        _selectedMessage = message;
        _selectedContact = contact;
        _pageState = PageState.idle;
      });
    } catch (error) {
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

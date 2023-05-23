import "package:courrier/components/fade_in_y.dart";
import "package:courrier/components/message_tile.dart";
import "package:courrier/helpers.dart";
import "package:courrier/types/contact.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:courrier/types/enums/enum_page_state.dart";
import "package:courrier/types/message.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:lottie/lottie.dart";

/// A list view of messages to display.
class MessageListView extends StatelessWidget {
  const MessageListView({
    super.key,
    required this.selectedMessage,
    this.contactMap = const {},
    this.messages = const [],
    this.onTapMessage,
    this.pageDataFilter = PageDataFilter.inbox,
    this.pageState = PageState.idle,
  });

  /// List of messages to display.
  final List<Message> messages;

  /// Called when the user taps a message tile.
  final void Function(Message message, Contact contact)? onTapMessage;

  /// Current selected message.
  final Message selectedMessage;

  /// Map of contacts.
  /// Useful to find contact in O(1).
  final Map<String, Contact> contactMap;

  /// Tell us which type of data to fetch (e.g. inbox, arvhied, deleted, ...).
  final PageDataFilter pageDataFilter;

  /// The current state of the page (e.g. idle, loading, error).
  final PageState pageState;

  @override
  Widget build(BuildContext context) {
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;

    if (pageState == PageState.loading) {
      return SizedBox(
        width: 300.0,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Column(
              children: [
                Lottie.asset(
                  "assets/animations/loading-mail.json",
                  width: 290.0,
                ),
                Text(
                  "${"loading".tr()}...",
                  style: Helpers.fonts.body5(
                    textStyle: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: color?.withOpacity(0.6),
                    ),
                  ),
                ),
              ],
            ),
            const VerticalDivider(
              thickness: 1.0,
              width: 4.0,
            ),
          ],
        ),
      );
    }

    if (messages.isEmpty) {
      return SizedBox(
        width: 304.0,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 300.0,
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    "empty_message_list_view.title".tr(),
                    style: Helpers.fonts.body(
                      textStyle: TextStyle(
                        fontSize: 18.0,
                        fontWeight: FontWeight.w600,
                        color: color?.withOpacity(0.8),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8.0),
                    child: Text(
                      "empty_message_list_view.description.${pageDataFilter.name}"
                          .tr(),
                      style: Helpers.fonts.body5(
                        textStyle: TextStyle(
                          fontSize: 16.0,
                          fontWeight: FontWeight.w200,
                          color: color?.withOpacity(0.4),
                        ),
                      ),
                    ),
                  ),
                  Lottie.asset(
                    "assets/animations/mail-with-background.json",
                    repeat: false,
                    fit: BoxFit.cover,
                  ),
                ],
              ),
            ),
            const VerticalDivider(
              thickness: 1.0,
              width: 4.0,
            ),
          ],
        ),
      );
    }

    return SizedBox(
      width: 304.0,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 300.0,
            child: CustomScrollView(
              slivers: [
                SliverList.builder(
                  itemBuilder: (BuildContext context, int index) {
                    final Message message = messages[index];
                    final Contact? contact = contactMap[message.contactId];

                    return FadeInY(
                      beginY: 12.0,
                      delay: Duration(
                        milliseconds: Helpers.ui.getNextAnimationDelay(
                          animationName: "message_list_view",
                          reset: index == 0,
                        ),
                      ),
                      child: MessageTile(
                        message: message,
                        selected: selectedMessage.id == message.id,
                        contact: contact ?? Contact.empty(),
                        onTap: onTapMessage,
                      ),
                    );
                  },
                  itemCount: messages.length,
                ),
              ],
            ),
          ),
          const VerticalDivider(
            thickness: 1.0,
            width: 4.0,
          ),
        ],
      ),
    );
  }
}

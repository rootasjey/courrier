import "package:courrier/components/fade_in_y.dart";
import "package:courrier/helpers.dart";
import "package:courrier/screens/messages_page/action_header.dart";
import "package:courrier/screens/messages_page/contact_header.dart";
import "package:courrier/types/contact.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:courrier/types/message.dart";
import "package:flutter/material.dart";

class ContentView extends StatelessWidget {
  const ContentView({
    super.key,
    required this.selectedContact,
    required this.selectedMessage,
    required this.pageDataFilter,
    this.onUnselectMessage,
    this.onArchiveMessage,
    this.onDeleteMessage,
    this.onFlagMessage,
  });

  /// Current selected contact.
  final Contact selectedContact;

  /// Current selected message.
  final Message selectedMessage;

  /// Called when the user taps on the back button.
  final void Function()? onUnselectMessage;

  /// Called when the user taps on the archive button.
  final void Function()? onArchiveMessage;

  /// Called when the user taps on the delete button.
  final void Function()? onDeleteMessage;

  /// Called when the user taps on the flag button.
  final void Function()? onFlagMessage;

  /// Tell us which type of data has been fetched
  final PageDataFilter pageDataFilter;

  @override
  Widget build(BuildContext context) {
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;

    return CustomScrollView(
      slivers: [
        ActionHeader(
          selectedMessage: selectedMessage,
          onArchiveMessage: onArchiveMessage,
          onDeleteMessage: onDeleteMessage,
          onFlagMessage: onFlagMessage,
          onUnselectMessage: onUnselectMessage,
          pageDataFilter: pageDataFilter,
        ),
        ContactHeader(
          selectedContact: selectedContact,
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(
              left: 24.0,
              right: 24.0,
              top: 32.0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FadeInY(
                  beginY: 12.0,
                  delay: const Duration(milliseconds: 250),
                  child: Text(
                    selectedMessage.subject,
                    style: Helpers.fonts.body5(
                      textStyle: TextStyle(
                        fontWeight: FontWeight.w500,
                        fontSize: 28.0,
                        color: color?.withOpacity(0.8),
                      ),
                    ),
                  ),
                ),
                FadeInY(
                  beginY: 12.0,
                  delay: const Duration(milliseconds: 500),
                  child: Padding(
                    padding: const EdgeInsets.only(top: 16.0),
                    child: Text(
                      selectedMessage.body,
                      style: Helpers.fonts.body(
                        textStyle: TextStyle(
                          fontSize: 16.0,
                          color: color?.withOpacity(0.4),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

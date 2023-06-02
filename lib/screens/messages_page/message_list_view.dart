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
import "package:unicons/unicons.dart";

/// A list view of messages to display.
class MessageListView extends StatelessWidget {
  const MessageListView({
    super.key,
    required this.selectedMessage,
    this.contactMap = const {},
    this.messages = const [],
    this.onTapMessage,
    this.onTapSettings,
    this.pageDataFilter = PageDataFilter.inbox,
    this.pageState = PageState.idle,
    this.isMobileSize = false,
    this.windowSize = const Size(0, 0),
  });

  /// True if the app's width is narrow.
  final bool isMobileSize;

  final Size windowSize;

  /// List of messages to display.
  final List<Message> messages;

  /// Called when the user taps a message tile.
  final void Function(Message message, Contact contact)? onTapMessage;

  final void Function()? onTapSettings;

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
    final double sideMenuWidth = windowSize.width < 480.0 ? 0 : 100.0;
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;

    if (pageState == PageState.preLoading) {
      return Container();
    }

    final double windowWidth = windowSize.width;
    final double extWidth = isMobileSize ? windowWidth - sideMenuWidth : 304.0;
    final double intWidth = isMobileSize ? windowWidth - sideMenuWidth : 300.0;

    if (pageState == PageState.loading) {
      return SizedBox(
        width: intWidth,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Column(
              children: [
                Lottie.asset(
                  "assets/animations/loading-mail.json",
                  width: extWidth - 24.0,
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
            if (!isMobileSize)
              const VerticalDivider(
                thickness: 1.0,
                width: 4.0,
              ),
          ],
        ),
      );
    }

    final Widget settingsButton = isMobileSize
        ? Positioned(
            top: 0.0,
            right: 12.0,
            child: IconButton(
              tooltip: "settings.title".tr(),
              onPressed: onTapSettings,
              color: color?.withOpacity(0.6),
              icon: const Icon(UniconsLine.setting),
            ),
          )
        : Container();

    if (messages.isEmpty) {
      return SizedBox(
        width: extWidth,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: intWidth,
              padding: const EdgeInsets.all(24.0),
              child: Stack(
                children: [
                  Column(
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
                ],
              ),
            ),
            if (!isMobileSize)
              const VerticalDivider(
                thickness: 1.0,
                width: 4.0,
              ),
          ],
        ),
      );
    }

    return SizedBox(
      width: extWidth,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: intWidth,
            padding: const EdgeInsets.only(top: 16.0),
            child: Stack(
              children: [
                CustomScrollView(
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
                settingsButton,
              ],
            ),
          ),
          if (!isMobileSize)
            const VerticalDivider(
              thickness: 1.0,
              width: 4.0,
            ),
        ],
      ),
    );
  }
}

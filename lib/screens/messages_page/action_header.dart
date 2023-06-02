import "package:courrier/components/fade_in_x.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:courrier/types/message.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:font_awesome_flutter/font_awesome_flutter.dart";
import "package:unicons/unicons.dart";

class ActionHeader extends StatelessWidget {
  const ActionHeader({
    super.key,
    required this.selectedMessage,
    this.onUnselectMessage,
    this.onArchiveMessage,
    this.onDeleteMessage,
    this.onFlagMessage,
    this.pageDataFilter = PageDataFilter.inbox,
  });

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
  /// (e.g. inbox, arvhied, deleted, ...).
  final PageDataFilter pageDataFilter;

  @override
  Widget build(BuildContext context) {
    const double beginX = 12.0;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Wrap(
          spacing: 12.0,
          children: [
            FadeInX(
              beginX: beginX,
              delay: const Duration(milliseconds: 0),
              child: IconButton(
                onPressed: onUnselectMessage,
                tooltip: "close_message".tr(),
                icon: const Icon(UniconsLine.arrow_left),
              ),
            ),
            if (pageDataFilter != PageDataFilter.archived &&
                pageDataFilter != PageDataFilter.deleted)
              FadeInX(
                beginX: beginX,
                delay: const Duration(milliseconds: 12),
                child: IconButton(
                  onPressed: onArchiveMessage,
                  tooltip: "archive_message".tr(),
                  icon: const Icon(UniconsLine.archive),
                ),
              ),
            FadeInX(
              beginX: beginX,
              delay: const Duration(milliseconds: 24),
              child: IconButton(
                onPressed: onDeleteMessage,
                tooltip: pageDataFilter == PageDataFilter.deleted
                    ? "delete_message".tr()
                    : "move_message_trash".tr(),
                icon: const Icon(UniconsLine.trash),
              ),
            ),
            if (pageDataFilter != PageDataFilter.deleted)
              FadeInX(
                beginX: beginX,
                delay: const Duration(milliseconds: 36),
                child: IconButton(
                  onPressed: onFlagMessage,
                  tooltip: "flag_message".tr(),
                  color: selectedMessage.isFlagged ? Colors.red : null,
                  icon: selectedMessage.isFlagged
                      ? const Icon(FontAwesomeIcons.solidHeart, size: 22.0)
                      : const Icon(UniconsLine.heart),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

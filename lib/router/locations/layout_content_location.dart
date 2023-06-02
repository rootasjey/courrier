import "package:beamer/beamer.dart";
import "package:courrier/screens/about_page.dart";
import "package:courrier/screens/messages_page/messages_layout_page.dart";
import "package:courrier/screens/settings_page.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/widgets.dart";

class LayoutContentLocation extends BeamLocation<BeamState> {
  /// About route location.
  static const String aboutRoute = "/about";

  /// Archived messages route location.
  static const String archivedRoute = "/archived";

  /// Archvied messages wildcard route location.
  static const String archivedWildCardRoot = "$archivedRoute/*";

  /// Deleted messages route location.
  static const String deletedRoute = "/deleted";

  /// Deleted messages (wildcard) route location.
  static const String deletedWildCardRoute = "$deletedRoute/*";

  /// Flagged messages route location.
  static const String flaggedRoute = "/flagged";

  /// Flagged messages wildcard route location.
  static const String flaggedWildCardRoot = "$flaggedRoute/*";

  /// Inbox route location.
  static const String inboxRoute = "/inbox";

  /// Inbox wildcard route location.
  static const String inboxWildCardRoot = "$inboxRoute/*";

  /// Settings route location.
  static const String settingsRoute = "/settings";

  @override
  List<BeamGuard> get guards =>
      super.guards +
      [
        BeamGuard(
          pathPatterns: ["/"],
          check: (context, location) => false,
          beamToNamed: (origin, target) => inboxRoute,
        ),
      ];

  @override
  List<Pattern> get pathPatterns => [
        aboutRoute,
        archivedRoute,
        archivedWildCardRoot,
        deletedRoute,
        deletedWildCardRoute,
        flaggedRoute,
        flaggedWildCardRoot,
        inboxRoute,
        inboxWildCardRoot,
        settingsRoute,
      ];

  @override
  List<BeamPage> buildPages(BuildContext context, BeamState state) {
    String pageTitle = "page_title.inbox".tr();
    PageDataFilter pageDataFilter = PageDataFilter.inbox;
    String valueKey = inboxRoute;

    final List<String> segments = state.pathPatternSegments;

    if (segments.contains(flaggedRoute.replaceFirst("/", ""))) {
      pageTitle = "page_title.flagged".tr();
      pageDataFilter = PageDataFilter.flagged;
      valueKey = flaggedRoute;
    } else if (segments.contains(archivedRoute.replaceFirst("/", ""))) {
      pageTitle = "page_title.archived".tr();
      pageDataFilter = PageDataFilter.archived;
      valueKey = archivedRoute;
    } else if (segments.contains(deletedRoute.replaceFirst("/", ""))) {
      pageTitle = "page_title.deleted".tr();
      pageDataFilter = PageDataFilter.deleted;
      valueKey = deletedRoute;
    }

    return [
      BeamPage(
        child: MessagesLayoutPage(
          pageDataFilter: pageDataFilter,
        ),
        key: ValueKey(valueKey),
        title: pageTitle,
        type: BeamPageType.fadeTransition,
      ),
      if (state.pathPatternSegments.contains("about"))
        BeamPage(
          child: const AboutPage(),
          key: const ValueKey(aboutRoute),
          title: "page_title.about".tr(),
          type: BeamPageType.fadeTransition,
        ),
      if (state.pathPatternSegments.contains("settings"))
        BeamPage(
          child: const SettingsPage(),
          key: const ValueKey(settingsRoute),
          title: "page_title.settings".tr(),
          type: BeamPageType.fadeTransition,
        ),
    ];
  }
}

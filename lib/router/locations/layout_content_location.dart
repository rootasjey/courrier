import "package:beamer/beamer.dart";
import "package:courrier/screens/about_page.dart";
import "package:courrier/screens/home_page.dart";
import "package:courrier/screens/settings_page.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/widgets.dart";

class LayoutContentLocation extends BeamLocation<BeamState> {
  /// About route location.
  static const String aboutRoute = "/about";

  /// Archived messages route location.
  static const String archivedMessageRoute = "/archived";

  /// Deleted messages route location.
  static const String deletedMessageRoute = "/deleted";

  /// Flagged messages route location.
  static const String flaggedMessageRoute = "/flagged";

  /// Inbox route location.
  static const String inboxRoute = "/inbox";

  /// Inbox wildcard route location.
  static const String inboxWildCard = "/inbox/*";

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
        archivedMessageRoute,
        deletedMessageRoute,
        flaggedMessageRoute,
        inboxRoute,
        inboxWildCard,
        settingsRoute,
      ];

  @override
  List<BeamPage> buildPages(BuildContext context, BeamState state) {
    String pageTitle = "page_title.inbox".tr();
    PageDataFilter pageDataFilter = PageDataFilter.inbox;
    String valueKey = inboxRoute;

    if (state.pathPatternSegments.contains("flagged")) {
      pageTitle = "page_title.flagged".tr();
      pageDataFilter = PageDataFilter.flagged;
      valueKey = flaggedMessageRoute;
    } else if (state.pathPatternSegments.contains("archived")) {
      pageTitle = "page_title.archived".tr();
      pageDataFilter = PageDataFilter.archived;
      valueKey = archivedMessageRoute;
    } else if (state.pathPatternSegments.contains("deleted")) {
      pageTitle = "page_title.deleted".tr();
      pageDataFilter = PageDataFilter.deleted;
      valueKey = deletedMessageRoute;
    }

    return [
      BeamPage(
        child: HomePage(
          pageDataFilter: pageDataFilter,
        ),
        key: ValueKey(valueKey),
        title: pageTitle,
        type: BeamPageType.fadeTransition,
      ),
      if (state.pathPatternSegments.contains("deleted"))
        BeamPage(
          child: HomePage(
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

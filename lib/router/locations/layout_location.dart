import "package:beamer/beamer.dart";
import "package:courrier/constants.dart";
import "package:courrier/helpers.dart";
import "package:courrier/screens/layout_page.dart";
import "package:courrier/screens/mobile_layout_page.dart";
import "package:flutter/widgets.dart";

class LayoutLocation extends BeamLocation<BeamState> {
  /// Main root value for this location.
  static const String route = "/";
  static const String routeWildcard = "/*";

  @override
  List<Pattern> get pathPatterns => [routeWildcard];

  @override
  List<BeamPage> buildPages(BuildContext context, BeamState state) {
    final BeamPage homePage = Helpers.size.isMobileSize(context)
        ? const BeamPage(
            child: MobileLayoutPage(),
            key: ValueKey("mobile"),
            title: Constants.appName,
            type: BeamPageType.fadeTransition,
          )
        : const BeamPage(
            child: LayoutPage(),
            key: ValueKey("desktop"),
            title: Constants.appName,
            type: BeamPageType.fadeTransition,
          );

    return [
      homePage,
    ];
  }
}

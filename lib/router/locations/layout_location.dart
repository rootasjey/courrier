import 'package:beamer/beamer.dart';
import 'package:courrier/screens/layout_page.dart';
import 'package:flutter/widgets.dart';

class LayoutLocation extends BeamLocation<BeamState> {
  /// Main root value for this location.
  static const String route = "/";
  static const String routeWildcard = "/*";

  @override
  List<Pattern> get pathPatterns => [routeWildcard];

  @override
  List<BeamPage> buildPages(BuildContext context, BeamState state) {
    return [
      const BeamPage(
        child: LayoutPage(),
        key: ValueKey(route),
        title: "courrier",
        type: BeamPageType.fadeTransition,
      ),
    ];
  }
}

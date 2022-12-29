import 'package:beamer/beamer.dart';
import 'package:courrier/screens/about_page.dart';
import 'package:courrier/screens/home_page.dart';
import 'package:courrier/screens/settings_page.dart';
import 'package:flutter/widgets.dart';

class LayoutContentLocation extends BeamLocation<BeamState> {
  /// Main root value for this location.
  static const String route = "";
  static const String homeRoute = "/";
  static const String settingsRoute = "$route/settings";
  static const String aboutRoute = "$route/about";

  @override
  List<Pattern> get pathPatterns => [
        aboutRoute,
        settingsRoute,
      ];

  @override
  List<BeamPage> buildPages(BuildContext context, BeamState state) {
    return [
      const BeamPage(
        child: HomePage(),
        key: ValueKey("home"),
        title: "courrier",
        type: BeamPageType.fadeTransition,
      ),
      if (state.pathPatternSegments.contains("about"))
        const BeamPage(
          child: AboutPage(),
          key: ValueKey(aboutRoute),
          title: "courrier | about",
          type: BeamPageType.fadeTransition,
        ),
      if (state.pathPatternSegments.contains("settings"))
        const BeamPage(
          child: SettingsPage(),
          key: ValueKey(settingsRoute),
          title: "courrier | settings",
          type: BeamPageType.fadeTransition,
        ),
    ];
  }
}

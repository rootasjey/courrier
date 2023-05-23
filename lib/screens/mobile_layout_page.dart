import "package:beamer/beamer.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:courrier/screens/app_bottom_app_bar.dart";
import "package:flutter/material.dart";

class MobileLayoutPage extends StatefulWidget {
  const MobileLayoutPage({super.key});

  @override
  State<MobileLayoutPage> createState() => _MobileLayoutPageState();
}

class _MobileLayoutPageState extends State<MobileLayoutPage> {
  final _beamerKey = GlobalKey<BeamerState>();

  @override
  Widget build(BuildContext context) {
    return HeroControllerScope(
      controller: HeroController(),
      child: Material(
        child: Scaffold(
          body: Beamer(
            key: _beamerKey,
            routerDelegate: BeamerDelegate(
              locationBuilder: BeamerLocationBuilder(
                beamLocations: [
                  LayoutContentLocation(),
                ],
              ),
            ),
          ),
          bottomNavigationBar: AppBottomAppBar(
            beamerKey: _beamerKey,
          ),
        ),
      ),
    );
  }
}

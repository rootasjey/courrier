import "package:beamer/beamer.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:courrier/screens/side_menu.dart";
import "package:flutter/material.dart";

/// The main layout page of the app.
class LayoutPage extends StatefulWidget {
  const LayoutPage({super.key});

  @override
  createState() => _LayoutPageState();
}

class _LayoutPageState extends State<LayoutPage> {
  final _beamerKey = GlobalKey<BeamerState>(debugLabel: "layout-beamer-key");
  final _beamerDelegate = BeamerDelegate(
    locationBuilder: BeamerLocationBuilder(
      beamLocations: [
        LayoutContentLocation(),
      ],
    ),
  );

  @override
  Widget build(context) {
    return HeroControllerScope(
      controller: HeroController(),
      child: Material(
        child: Stack(
          children: [
            Row(
              children: [
                SideMenu(
                  beamerKey: _beamerKey,
                ),
                Expanded(
                  child: Material(
                    elevation: 6.0,
                    child: Beamer(
                      key: _beamerKey,
                      routerDelegate: _beamerDelegate,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

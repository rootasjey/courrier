import 'package:beamer/beamer.dart';
import 'package:courrier/router/locations/layout_content_location.dart';
import 'package:courrier/screens/layout_page_side_menu.dart';
import 'package:flutter/material.dart';

/// User's atelier widget.
class LayoutPage extends StatefulWidget {
  const LayoutPage({super.key});

  @override
  createState() => _LayoutPageState();
}

class _LayoutPageState extends State<LayoutPage> {
  final _beamerKey = GlobalKey<BeamerState>();

  @override
  Widget build(context) {
    // final bool isMobileSize = Helpers.size.isMobileSize(context);

    return HeroControllerScope(
      controller: HeroController(),
      child: Material(
        child: Stack(
          children: [
            Row(
              children: [
                LayoutPageSideMenu(
                  beamerKey: _beamerKey,
                ),
                Expanded(
                  child: Material(
                    elevation: 6.0,
                    child: Beamer(
                      key: _beamerKey,
                      routerDelegate: BeamerDelegate(
                        locationBuilder: BeamerLocationBuilder(beamLocations: [
                          LayoutContentLocation(),
                        ]),
                      ),
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

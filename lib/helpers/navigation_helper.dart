import "package:beamer/beamer.dart";
import "package:courrier/router/locations/layout_location.dart";
import "package:flutter/widgets.dart";

class NavigationHelper {
  const NavigationHelper();

  void back(BuildContext context, {bool isMobile = false}) {
    if (isMobile) {
      final bool handled = handleMobileBack(context);

      if (handled) {
        return;
      }
    }

    if (Beamer.of(context).canBeamBack) {
      Beamer.of(context).beamBack();
      return;
    }

    Beamer.of(context).popRoute();
  }

  /// Return hero tag stored as a string from `routeState` map if any.
  String getHeroTag(Object? routeState) {
    if (routeState == null) {
      return "";
    }

    final mapState = routeState as Map<String, dynamic>;
    return mapState["heroTag"] ?? "";
  }

  bool handleMobileBack(BuildContext context) {
    final String location = Beamer.of(context)
            .beamingHistory
            .last
            .history
            .last
            .routeInformation
            .location ??
        "";

    final bool containsAtelier = location.contains("atelier");
    final List<String> locationParts = location.split("/");
    final bool threeDepths = locationParts.length == 3;
    if (!threeDepths) {
      return false;
    }

    final bool atelierIsSecond = locationParts.elementAt(1) == "atelier";

    if (containsAtelier && threeDepths && atelierIsSecond) {
      Beamer.of(context, root: true)
          .beamToNamed(LayoutLocation.route, routeState: {
        "initialTabIndex": 2,
      });
      return true;
    }

    return false;
  }
}

import "package:beamer/beamer.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:courrier/router/locations/layout_location.dart";

final appLocationBuilder = BeamerDelegate(
  notFoundRedirectNamed: LayoutContentLocation.inboxRoute,
  initialPath: LayoutContentLocation.inboxRoute,
  locationBuilder: BeamerLocationBuilder(
    beamLocations: [
      LayoutLocation(),
    ],
  ),
);

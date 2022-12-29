import 'package:beamer/beamer.dart';
import 'package:courrier/router/locations/layout_location.dart';

final appLocationBuilder = BeamerDelegate(
  locationBuilder: BeamerLocationBuilder(
    beamLocations: [
      LayoutLocation(),
    ],
  ),
);

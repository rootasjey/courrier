import "package:flutter/material.dart";
import "package:modal_bottom_sheet/modal_bottom_sheet.dart";

class UIHelper {
  const UIHelper();

  /// Starting delays for animations.
  static Map<String, int> delayMap = {
    "noname": 0,
  };

  /// Amount to add to delay for the next widget to animate.
  final int _step = 25;

  /// Show a dialog or a modal bottom sheet according to `isMobileSize` value.
  void showAdaptiveDialog(
    BuildContext context, {
    required Widget Function(BuildContext) builder,
    bool isMobileSize = false,
    Color backgroundColor = Colors.white,
  }) {
    if (isMobileSize) {
      showCupertinoModalBottomSheet(
        context: context,
        expand: false,
        backgroundColor: backgroundColor,
        builder: builder,
      );
      return;
    }

    showDialog(
      context: context,
      builder: builder,
    );
  }

  /// Where to start the fade in Y animation.
  double getBeginY() {
    return 60.0;
  }

  int getNextAnimationDelay({String animationName = "", bool reset = false}) {
    final String key = animationName.isNotEmpty ? animationName : "noname";
    int delay = delayMap[key] ?? 0;
    delay = reset ? 0 : delay + _step;

    delayMap[key] = delay;
    return delay;
  }
}

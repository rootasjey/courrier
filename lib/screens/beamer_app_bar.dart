import "package:beamer/beamer.dart";
import "package:courrier/constants.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:salomon_bottom_bar/salomon_bottom_bar.dart";
import "package:unicons/unicons.dart";

/// An bottom app bar linked to beamer router.
class BeamerAppBar extends StatefulWidget {
  const BeamerAppBar({
    super.key,
    required this.beamerKey,
  });

  final GlobalKey<BeamerState> beamerKey;

  @override
  State<BeamerAppBar> createState() => _BeamerAppBarState();
}

class _BeamerAppBarState extends State<BeamerAppBar> {
  late BeamerDelegate _beamerDelegate;

  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();

    // NOTE: Beamer state isn't ready on 1st frame
    // probably because [SidePanelMenu] appears before the Beamer widget.
    // So we use [addPostFrameCallback] to access the state in the next frame.
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) {
      final BeamerState? currentState = widget.beamerKey.currentState;

      if (currentState != null) {
        _beamerDelegate = currentState.routerDelegate;
        _beamerDelegate.addListener(_setStateListener);
      }
    });
  }

  @override
  void dispose() {
    _beamerDelegate.removeListener(_setStateListener);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SalomonBottomBar(
      currentIndex: _currentIndex,
      onTap: onTapItem,
      items: [
        SalomonBottomBarItem(
          icon: const Icon(UniconsLine.home),
          title: Text("inbox".tr()),
          selectedColor: Constants.colors.home,
        ),
        SalomonBottomBarItem(
          icon: const Icon(UniconsLine.heart),
          title: Text("flagged".tr()),
          selectedColor: Constants.colors.likes,
        ),
        SalomonBottomBarItem(
          icon: const Icon(UniconsLine.archive),
          title: Text("archived".tr()),
          selectedColor: Constants.colors.galleries,
        ),
        SalomonBottomBarItem(
          icon: const Icon(UniconsLine.trash),
          title: Text("deleted".tr()),
          selectedColor: Constants.colors.delete,
        ),
        // SalomonBottomBarItem(
        //   icon: const Icon(UniconsLine.user),
        //   title: Text("profile".tr()),
        //   selectedColor: Colors.amber.shade800,
        // ),
      ],
    );
  }

  void _setStateListener() => setState(() {});

  onTapItem(int newIndex) {
    switch (newIndex) {
      case 0:
        _beamerDelegate.beamToNamed(LayoutContentLocation.inboxRoute);
        break;
      case 1:
        _beamerDelegate.beamToNamed(LayoutContentLocation.flaggedRoute);
        break;
      case 2:
        _beamerDelegate.beamToNamed(LayoutContentLocation.archivedRoute);
        break;
      case 3:
        _beamerDelegate.beamToNamed(LayoutContentLocation.deletedRoute);
        break;
      // case 4:
      //   _beamerDelegate.beamToNamed(LayoutContentLocation.settingsRoute);
      //   break;
      default:
        _beamerDelegate.beamToNamed(LayoutContentLocation.inboxRoute);
    }

    setState(() => _currentIndex = newIndex);
  }
}

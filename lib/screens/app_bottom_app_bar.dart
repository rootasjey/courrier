import "package:beamer/beamer.dart";
import "package:courrier/constants.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:salomon_bottom_bar/salomon_bottom_bar.dart";
import "package:unicons/unicons.dart";

class AppBottomAppBar extends StatefulWidget {
  const AppBottomAppBar({
    super.key,
    required this.beamerKey,
  });

  final GlobalKey<BeamerState> beamerKey;

  @override
  State<AppBottomAppBar> createState() => _AppBottomAppBarState();
}

class _AppBottomAppBarState extends State<AppBottomAppBar> {
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
          title: Text("home".tr()),
          selectedColor: Constants.colors.home,
        ),
        SalomonBottomBarItem(
          icon: const Icon(UniconsLine.archive),
          title: Text("archived".tr()),
          selectedColor: Constants.colors.galleries,
        ),
        SalomonBottomBarItem(
          icon: const Icon(UniconsLine.archive),
          title: Text("deleted".tr()),
          selectedColor: Constants.colors.delete,
        ),
        SalomonBottomBarItem(
          icon: const Icon(UniconsLine.user),
          title: Text("profile".tr()),
          selectedColor: Colors.amber.shade800,
        ),
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
        _beamerDelegate.beamToNamed(LayoutContentLocation.archivedMessageRoute);
        break;
      case 2:
        _beamerDelegate.beamToNamed(LayoutContentLocation.deletedMessageRoute);
        break;
      case 3:
        _beamerDelegate.beamToNamed(LayoutContentLocation.settingsRoute);
        break;
      default:
        _beamerDelegate.beamToNamed(LayoutContentLocation.inboxRoute);
    }

    setState(() => _currentIndex = newIndex);
  }
}

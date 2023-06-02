import "package:beamer/beamer.dart";
import "package:courrier/components/text_icon_button.dart";
import "package:courrier/constants.dart";
import "package:courrier/helpers.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:courrier/router/locations/layout_location.dart";
import "package:courrier/types/side_menu_items.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:unicons/unicons.dart";

/// Application's side menu.
class SideMenu extends ConsumerStatefulWidget {
  const SideMenu({
    Key? key,
    required this.beamerKey,
  }) : super(key: key);

  final GlobalKey<BeamerState> beamerKey;

  @override
  createState() => _DashboardSideMenuState();
}

class _DashboardSideMenuState extends ConsumerState<SideMenu> {
  late BeamerDelegate _beamerDelegate;

  /// True if the side menu is expanded showing icons and labels.
  /// If false, the side menu shows only icon.
  /// Default to true.
  bool _isExpanded = true;

  /// The width of the side menu when expanded.
  final double _expandedWidth = 300.0;

  /// The width of the side menu when collapsed.
  final double _collapsedWidth = 100.0;

  /// The scroll controller of the side panel
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _isExpanded = false;
    // _isExpanded = Helpers.storage.getDashboardSideMenuExpanded();

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
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final Size windowSize = MediaQuery.of(context).size;
    final isMobileSize = windowSize.width < 600.0;
    final showExpandButton = !isMobileSize;

    return Material(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeOutExpo,
        width: _isExpanded ? _expandedWidth : _collapsedWidth,
        child: Stack(
          children: [
            OverflowBox(
              minWidth: 40.0,
              maxWidth: 300.0,
              alignment: Alignment.topLeft,
              child: CustomScrollView(
                controller: _scrollController,
                slivers: <Widget>[
                  topSidePanel(),
                  bodySidePanel(isMobileSize: isMobileSize),
                  space(),
                ],
              ),
            ),
            if (showExpandButton) toggleExpandButton(),
          ],
        ),
      ),
    );
  }

  Widget bodySidePanel({bool isMobileSize = false}) {
    return SliverPadding(
      padding: EdgeInsets.only(
        left: _isExpanded ? 20.0 : 28.0,
        right: 20.0,
        bottom: isMobileSize ? 40.0 : 100.0,
      ),
      sliver: SliverList(
          delegate: SliverChildListDelegate.fixed(
        getItemList().map(
          (final SideMenuItem sidePanelItem) {
            final Color foregroundColor =
                Theme.of(context).textTheme.bodyLarge?.color ?? Colors.white;

            Color color = foregroundColor.withOpacity(0.6);
            Color textColor = foregroundColor.withOpacity(0.4);
            FontWeight fontWeight = FontWeight.w700;

            final String? currentLocation =
                context.currentBeamLocation.state.routeInformation.location;

            bool pathMatch =
                currentLocation?.contains(sidePanelItem.routePath) ?? false;

            if (sidePanelItem.routePath == LayoutLocation.route &&
                currentLocation != LayoutLocation.route) {
              pathMatch = false;
            }

            if (pathMatch) {
              color = sidePanelItem.hoverColor;
              textColor = foregroundColor.withOpacity(0.6);
              fontWeight = FontWeight.w800;
            }

            return Align(
              alignment: Alignment.topLeft,
              child: Container(
                padding: EdgeInsets.only(
                  left: _isExpanded ? 24.0 : 0.0,
                  top: 32.0,
                ),
                child: TextButtonIcon(
                  compact: !_isExpanded,
                  tooltip: sidePanelItem.label,
                  leading: Padding(
                    padding: const EdgeInsets.only(right: 16.0),
                    child: Icon(
                      sidePanelItem.iconData,
                      color: color,
                    ),
                  ),
                  child: Text(
                    sidePanelItem.label,
                    style: Helpers.fonts.body(
                      textStyle: TextStyle(
                        color: textColor,
                        fontSize: 16.0,
                        fontWeight: fontWeight,
                      ),
                    ),
                  ),
                  onTap: () {
                    if (sidePanelItem.routePath == LayoutLocation.route) {
                      Beamer.of(context, root: true).beamToNamed(
                        LayoutLocation.route,
                      );
                    } else {
                      context.beamToNamed(sidePanelItem.routePath);
                    }

                    if (!mounted) {
                      return;
                    }

                    setState(() {});
                  },
                ),
              ),
            );
          },
        ).toList(),
      )),
    );
  }

  Widget space() {
    return const SliverPadding(
      padding: EdgeInsets.only(bottom: 70.0),
    );
  }

  Widget toggleExpandButton() {
    const double maxHeight = 76.0;
    final Color color =
        Theme.of(context).textTheme.bodyMedium?.color ?? Colors.black;

    return Positioned(
      bottom: 0.0,
      left: 0.0,
      right: 0.0,
      child: Material(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: _expandedWidth,
            maxHeight: maxHeight,
          ),
          child: OverflowBox(
            maxWidth: _expandedWidth,
            maxHeight: maxHeight,
            child: InkWell(
              onTap: _toggleSideMenu,
              child: Container(
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(
                      color: color.withOpacity(0.025),
                      width: 2.0,
                    ),
                  ),
                ),
                padding: EdgeInsets.only(
                  top: 24.0,
                  left: _isExpanded ? 58.0 : 6.0,
                  bottom: 24.0,
                ),
                child: Row(
                  children: [
                    if (_isExpanded)
                      Tooltip(
                        message: "collapse".tr(),
                        child: const Icon(UniconsLine.left_arrow_from_left),
                      )
                    else
                      Expanded(
                        child: Tooltip(
                          message: "expand".tr(),
                          child: Icon(
                            UniconsLine.arrow_from_right,
                            color: color.withOpacity(0.6),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget topSidePanel() {
    return SliverPadding(
      padding: EdgeInsets.only(
        top: 24.0,
        bottom: 12.0,
        left: _isExpanded ? 0.0 : 16.0,
      ),
      sliver: SliverList(
        delegate: SliverChildListDelegate.fixed([
          Column(
            crossAxisAlignment: _isExpanded
                ? CrossAxisAlignment.center
                : CrossAxisAlignment.start,
            children: [
              TextButton(
                onPressed: () => Beamer.of(context).beamToNamed(
                  LayoutContentLocation.settingsRoute,
                ),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.black,
                ),
                child: Text(
                  Constants.appName.toLowerCase(),
                  style: Helpers.fonts.title(
                    textStyle: TextStyle(
                      fontSize: 16.0,
                      color: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.color
                          ?.withOpacity(0.6),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ]),
      ),
    );
  }

  List<SideMenuItem> getItemList() {
    return [
      ...getBaseItemList(),
      // ...getAdminItemList(userFirestore: userFirestore),
    ];
  }

  List<SideMenuItem> getBaseItemList() {
    return [
      SideMenuItem(
        iconData: UniconsLine.inbox,
        label: "inbox".tr(),
        hoverColor: Constants.colors.home,
        routePath: LayoutContentLocation.inboxRoute,
      ),
      SideMenuItem(
        iconData: UniconsLine.heart,
        label: "flagged".tr(),
        hoverColor: Constants.colors.activity,
        routePath: LayoutContentLocation.flaggedRoute,
      ),
      SideMenuItem(
        iconData: UniconsLine.archive,
        label: "archived".tr(),
        hoverColor: Constants.colors.galleries,
        routePath: LayoutContentLocation.archivedRoute,
      ),
      SideMenuItem(
        iconData: UniconsLine.trash,
        label: "deleted".tr(),
        hoverColor: Constants.colors.delete,
        routePath: LayoutContentLocation.deletedRoute,
      ),
    ];
  }

  void _setStateListener() => setState(() {});

  void _toggleSideMenu() {
    final bool newIsExpanded = !_isExpanded;

    setState(() {
      _isExpanded = newIsExpanded;
      // Utilities.storage.setDashboardSideMenuExpanded(_isExpanded);
    });

    // ref
    //     .read(AppState.dashboardSideMenuOpenProvider.notifier)
    //     .setVisibility(newIsExpanded);
  }
}

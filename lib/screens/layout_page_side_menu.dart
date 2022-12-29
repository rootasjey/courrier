import 'package:beamer/beamer.dart';
import 'package:courrier/components/text_icon_button.dart';
import 'package:courrier/constants.dart';
import 'package:courrier/helpers.dart';
import 'package:courrier/router/locations/layout_content_location.dart';
import 'package:courrier/router/locations/layout_location.dart';
import 'package:courrier/types/side_menu_items.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:unicons/unicons.dart';

/// User's atelier side menu.
class LayoutPageSideMenu extends ConsumerStatefulWidget {
  const LayoutPageSideMenu({
    Key? key,
    required this.beamerKey,
  }) : super(key: key);

  final GlobalKey<BeamerState> beamerKey;

  @override
  createState() => _DashboardSideMenuState();
}

class _DashboardSideMenuState extends ConsumerState<LayoutPageSideMenu> {
  late BeamerDelegate _beamerDelegate;

  /// True if the side menu is expanded showing icons and labels.
  /// If false, the side menu shows only icon.
  /// Default to true.
  bool _isExpanded = true;

  /// Show a button to scroll down the side panel if true.
  bool _showScrollDownButton = true;

  /// Show a button to scroll up the side panel if true.
  bool _showScrollUpButton = false;

  final double _expandedWidth = 300.0;
  final double _collapsedWidth = 100.0;

  final ScrollController _sidePanelScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _isExpanded = false;
    // _isExpanded = Helpers.storage.getDashboardSideMenuExpanded();

    _sidePanelScrollController.addListener(onScrollPanel);

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
    _sidePanelScrollController.removeListener(onScrollPanel);
    _sidePanelScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // if (Helpers.size.isMobileSize(context)) {
    //   return Container();
    // }

    return Material(
      color: Theme.of(context).backgroundColor,
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
                controller: _sidePanelScrollController,
                slivers: <Widget>[
                  topSidePanel(),
                  bodySidePanel(),
                  space(),
                ],
              ),
            ),
            scrollUpButton(),
            scrollDownButton(),
            toggleExpandButton(),
          ],
        ),
      ),
    );
  }

  Widget bodySidePanel() {
    // final UserFirestore? userFirestore =
    //     ref.watch(AppState.userProvider).firestoreUser;

    return SliverPadding(
      padding: EdgeInsets.only(
        left: _isExpanded ? 20.0 : 28.0,
        right: 20.0,
        bottom: 100.0,
      ),
      sliver: SliverList(
          delegate: SliverChildListDelegate.fixed(
        getItemList().map(
          (final SideMenuItem sidePanelItem) {
            final Color foregroundColor =
                Theme.of(context).textTheme.bodyText1?.color ?? Colors.white;

            Color color = foregroundColor.withOpacity(0.6);
            Color textColor = foregroundColor.withOpacity(0.4);
            FontWeight fontWeight = FontWeight.w700;

            bool pathMatch = context
                    .currentBeamLocation.state.routeInformation.location
                    ?.contains(sidePanelItem.routePath) ??
                false;

            if (sidePanelItem.routePath == LayoutLocation.route) {
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
                // width: _collapsedWidth,
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
                    if (sidePanelItem.routePath ==
                        "AtelierLocationContent.profileRoute") {
                      context.beamToNamed(
                        sidePanelItem.routePath,
                        routeState: {
                          // "userId": userFirestore?.id ?? "",
                        },
                      );
                    } else if (sidePanelItem.routePath ==
                        LayoutLocation.route) {
                      Beamer.of(context, root: true).beamToNamed(
                        LayoutLocation.route,
                      );
                    } else {
                      context.beamToNamed(sidePanelItem.routePath);
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

  Widget scrollDownButton() {
    if (!_showScrollDownButton) {
      return Container();
    }

    const double maxHeight = 76.0;
    final Color color =
        Theme.of(context).textTheme.bodyText2?.color ?? Colors.black;

    return Positioned(
      bottom: 70.0,
      left: 0.0,
      right: 0.0,
      child: Material(
        color: Theme.of(context).backgroundColor,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: _expandedWidth,
            maxHeight: maxHeight,
          ),
          child: OverflowBox(
            maxHeight: maxHeight,
            child: InkWell(
              onTap: () {
                _sidePanelScrollController.animateTo(
                  _sidePanelScrollController.offset + 70.0,
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.bounceIn,
                );
              },
              child: Container(
                padding: const EdgeInsets.only(
                  top: 24.0,
                  left: 0.0,
                  bottom: 24.0,
                ),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(
                      color: color.withOpacity(0.1),
                      width: 2.0,
                    ),
                  ),
                ),
                child: Tooltip(
                  message: "scroll_down".tr(),
                  child: const Icon(UniconsLine.arrow_down),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget scrollUpButton() {
    if (!_showScrollUpButton) {
      return Container();
    }

    const double maxHeight = 76.0;
    final Color color =
        Theme.of(context).textTheme.bodyText2?.color ?? Colors.black;

    return Positioned(
      top: 0.0,
      left: 0.0,
      right: 0.0,
      child: Material(
        color: Theme.of(context).backgroundColor,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: _expandedWidth,
            maxHeight: maxHeight,
          ),
          child: OverflowBox(
            maxHeight: maxHeight,
            child: InkWell(
              onTap: () {
                _sidePanelScrollController.animateTo(
                  _sidePanelScrollController.offset - 70.0,
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.bounceIn,
                );
              },
              child: Container(
                padding: const EdgeInsets.only(
                  top: 24.0,
                  left: 0.0,
                  bottom: 24.0,
                ),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: color.withOpacity(0.1),
                      width: 2.0,
                    ),
                  ),
                ),
                child: Tooltip(
                  message: "scroll_up".tr(),
                  child: const Icon(UniconsLine.arrow_up),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget space() {
    return const SliverPadding(
      padding: EdgeInsets.only(bottom: 70.0),
    );
  }

  Widget toggleExpandButton() {
    final Color color =
        Theme.of(context).textTheme.bodyText2?.color ?? Colors.black;
    const double maxHeight = 76.0;

    return Positioned(
      bottom: 0.0,
      left: 0.0,
      right: 0.0,
      child: Material(
        color: Theme.of(context).backgroundColor,
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
                          child: const Icon(UniconsLine.arrow_from_right),
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
        top: 40.0,
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
                // tooltip: "hub_subtitle".tr(),
                onPressed: () {
                  Beamer.of(context).beamToNamed("/");
                },
                style: TextButton.styleFrom(
                  foregroundColor: Colors.black,
                ),
                child: Text(
                  "Courrier",
                  style: Helpers.fonts.title(
                    textStyle: const TextStyle(
                      fontSize: 16.0,
                    ),
                  ),
                ),
                // icon: const Opacity(
                //   opacity: 0.8,
                //   child: Icon(UniconsLine.ruler_combined),
                // ),
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
        routePath: LayoutLocation.route,
      ),
      SideMenuItem(
        iconData: UniconsLine.star,
        label: "starred".tr(),
        hoverColor: Constants.colors.activity,
        routePath: "AtelierLocationContent.activityRoute",
      ),
      SideMenuItem(
        iconData: UniconsLine.envelope_send,
        label: "sent".tr(),
        hoverColor: Constants.colors.illustrations,
        routePath: "AtelierLocationContent.illustrationsRoute",
      ),
      SideMenuItem(
        iconData: UniconsLine.pen,
        label: "drafts".tr(),
        hoverColor: Constants.colors.books,
        routePath: "AtelierLocationContent.booksRoute",
      ),
      SideMenuItem(
        iconData: UniconsLine.archive,
        label: "archived".tr(),
        hoverColor: Constants.colors.galleries,
        routePath: "AtelierLocationContent.profileRoute",
      ),
      SideMenuItem(
        iconData: UniconsLine.trash,
        label: "deleted".tr(),
        hoverColor: Constants.colors.settings,
        routePath: "/deleted",
      ),
      SideMenuItem(
        iconData: UniconsLine.setting,
        label: "settings".tr(),
        hoverColor: Colors.pink,
        routePath: LayoutContentLocation.settingsRoute,
      ),
      SideMenuItem(
        iconData: UniconsLine.info,
        label: "about".tr(),
        hoverColor: Colors.amber.shade800,
        routePath: LayoutContentLocation.aboutRoute,
      ),
    ];
  }

  /// Callback fired when the side panel menu scrolls.
  /// Update update navigation button variables.
  void onScrollPanel() {
    if (_sidePanelScrollController.offset >=
        _sidePanelScrollController.position.maxScrollExtent) {
      _showScrollDownButton = false;
    } else {
      _showScrollDownButton = true;
    }

    if (_sidePanelScrollController.offset <= 0.0) {
      _showScrollUpButton = false;
    } else {
      _showScrollUpButton = true;
    }

    setState(() {});
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

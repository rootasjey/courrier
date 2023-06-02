import "package:adaptive_theme/adaptive_theme.dart";
import "package:beamer/beamer.dart";
import "package:courrier/components/circle_button.dart";
import "package:courrier/components/fade_in_x.dart";
import "package:courrier/components/theme_card.dart";
import "package:courrier/helpers.dart";
import "package:courrier/router/locations/layout_content_location.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:unicons/unicons.dart";

/// Page with settings.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;
    final bool isMobileSize = MediaQuery.of(context).size.width < 400.0;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: isMobileSize
                  ? const EdgeInsets.only(top: 40.0, left: 16.0, right: 16.0)
                  : const EdgeInsets.all(32.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  header(context, color: color),
                  body(context, color: color),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget body(BuildContext context, {Color? color}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FadeInX(
          beginX: 16.0,
          delay: Duration(
            milliseconds: Helpers.ui.getNextAnimationDelay(
              animationName: "settings",
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.only(top: 40.0, bottom: 8.0),
            child: Text(
              "Theme",
              style: Helpers.fonts.body(
                textStyle: TextStyle(
                  fontSize: 16.0,
                  fontWeight: FontWeight.w600,
                  color: color?.withOpacity(0.6),
                ),
              ),
            ),
          ),
        ),
        Wrap(
          spacing: 12.0,
          runSpacing: 12.0,
          children: [
            FadeInX(
              beginX: 16.0,
              delay: Duration(
                milliseconds: Helpers.ui.getNextAnimationDelay(
                  animationName: "settings",
                ),
              ),
              child: ThemeCard(
                title: "light".tr(),
                iconData: UniconsLine.sun,
                color: Colors.amber,
                active:
                    AdaptiveTheme.of(context).brightness == Brightness.light,
                onTap: AdaptiveTheme.of(context).setLight,
              ),
            ),
            FadeInX(
              beginX: 16.0,
              delay: Duration(
                milliseconds: Helpers.ui.getNextAnimationDelay(
                  animationName: "settings",
                ),
              ),
              child: ThemeCard(
                title: "dark".tr(),
                iconData: UniconsLine.moon,
                color: Colors.blue,
                active: AdaptiveTheme.of(context).brightness == Brightness.dark,
                onTap: AdaptiveTheme.of(context).setDark,
              ),
            ),
          ],
        ),
        FadeInX(
          beginX: 16.0,
          delay: Duration(
            milliseconds: Helpers.ui.getNextAnimationDelay(
              animationName: "settings",
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.only(top: 16.0),
            child: TextButton.icon(
              onPressed: () => onGoToAboutPage(context),
              icon: const Icon(UniconsLine.info_circle),
              label: Text("about".tr()),
              style: TextButton.styleFrom(
                foregroundColor: color?.withOpacity(0.6),
                textStyle: Helpers.fonts.body(
                  textStyle: const TextStyle(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget header(BuildContext context, {Color? color}) {
    return Row(
      children: [
        FadeInX(
          beginX: 16.0,
          delay: Duration(
            milliseconds: Helpers.ui.getNextAnimationDelay(
              animationName: "settings",
              reset: true,
            ),
          ),
          child: CircleButton(
            onTap: Beamer.of(context).popRoute,
            icon: Icon(UniconsLine.arrow_left, color: color),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(left: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FadeInX(
                beginX: 16.0,
                delay: Duration(
                  milliseconds: Helpers.ui.getNextAnimationDelay(
                    animationName: "settings",
                  ),
                ),
                child: Text(
                  "settings.title".tr(),
                  style: Helpers.fonts.title(
                    textStyle: TextStyle(
                      fontSize: 24.0,
                      fontWeight: FontWeight.w600,
                      color: color?.withOpacity(0.8),
                    ),
                  ),
                ),
              ),
              FadeInX(
                beginX: 16.0,
                delay: Duration(
                  milliseconds: Helpers.ui.getNextAnimationDelay(
                    animationName: "settings",
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.only(top: 0.0),
                  child: Text(
                    "settings.description".tr(),
                    style: Helpers.fonts.body(
                      textStyle: TextStyle(
                        fontWeight: FontWeight.w400,
                        color: color?.withOpacity(0.6),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void onGoToAboutPage(BuildContext context) {
    Beamer.of(context).beamToNamed(LayoutContentLocation.aboutRoute);
  }
}

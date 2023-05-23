import "package:adaptive_theme/adaptive_theme.dart";
import "package:courrier/components/theme_card.dart";
import "package:courrier/helpers.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:unicons/unicons.dart";

/// Page with settings.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(32.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "settings.title".tr(),
                    style: Helpers.fonts.title(
                      textStyle: TextStyle(
                        fontSize: 24.0,
                        fontWeight: FontWeight.w600,
                        color: color?.withOpacity(0.8),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8.0),
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
                  Padding(
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
                  Wrap(
                    spacing: 12.0,
                    runSpacing: 12.0,
                    children: [
                      ThemeCard(
                        title: "light".tr(),
                        iconData: UniconsLine.sun,
                        color: Colors.amber,
                        active: AdaptiveTheme.of(context).brightness ==
                            Brightness.light,
                        onTap: AdaptiveTheme.of(context).setLight,
                      ),
                      ThemeCard(
                        title: "dark".tr(),
                        iconData: UniconsLine.moon,
                        color: Colors.blue,
                        active: AdaptiveTheme.of(context).brightness ==
                            Brightness.dark,
                        onTap: AdaptiveTheme.of(context).setDark,
                      ),
                    ],
                  )
                  // SwitchListTile(value: AdaptiveTheme.of(context)., onChanged: onChanged)
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

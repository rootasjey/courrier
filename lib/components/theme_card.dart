import "package:courrier/helpers.dart";
import "package:flutter/material.dart";

/// A card to change application theme (e.g. light & dark).
class ThemeCard extends StatelessWidget {
  const ThemeCard({
    super.key,
    required this.title,
    this.color,
    required this.iconData,
    this.active = false,
    this.onTap,
  });

  /// Whether the card is active or not.
  /// Icon will be colored with [color] if provided.
  final bool active;

  /// Icon's color if active.
  final Color? color;

  /// Icon's data.
  final IconData iconData;

  /// Card's title.
  final String title;

  /// Called when the card is tapped.
  final void Function()? onTap;

  @override
  Widget build(BuildContext context) {
    final Color? grayColor = Theme.of(context).textTheme.bodyMedium?.color;

    return Card(
      elevation: active ? 0.0 : 6.0,
      shape: RoundedRectangleBorder(
        side: const BorderSide(
          color: Colors.black12,
          width: 2.0,
        ),
        borderRadius: BorderRadius.circular(8.0),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8.0),
        child: Container(
          width: 160.0,
          height: 180.0,
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                iconData,
                color: active ? color : grayColor?.withOpacity(0.6),
              ),
              Text(
                title,
                style: Helpers.fonts.body(
                  textStyle: TextStyle(
                    fontSize: 16.0,
                    fontWeight: FontWeight.w600,
                    color: grayColor?.withOpacity(0.6),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

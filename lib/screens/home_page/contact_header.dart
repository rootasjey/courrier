import "package:courrier/components/fade_in_x.dart";
import "package:courrier/helpers.dart";
import "package:courrier/types/contact.dart";
import "package:flutter/material.dart";

class ContactHeader extends StatelessWidget {
  const ContactHeader({
    super.key,
    required this.selectedContact,
  });

  /// Current selected contact.
  final Contact selectedContact;

  @override
  Widget build(BuildContext context) {
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.only(
          left: 24.0,
          right: 24.0,
        ),
        child: Row(
          children: [
            FadeInX(
              beginX: 12.0,
              delay: const Duration(milliseconds: 50),
              child: Padding(
                padding: const EdgeInsets.only(right: 8.0),
                child: CircleAvatar(
                  foregroundImage: NetworkImage(selectedContact.avatarUrl),
                  backgroundColor: Colors.black12,
                ),
              ),
            ),
            FadeInX(
              beginX: 12.0,
              delay: const Duration(milliseconds: 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    selectedContact.getName(),
                    style: Helpers.fonts.body(
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    "to me@example.com",
                    style: Helpers.fonts.body(
                      textStyle: TextStyle(
                        color: color?.withOpacity(0.4),
                      ),
                    ),
                  ),
                ],
              ),
            )
          ],
        ),
      ),
    );
  }
}

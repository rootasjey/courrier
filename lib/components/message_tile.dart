import "package:courrier/helpers.dart";
import "package:courrier/types/contact.dart";
import "package:courrier/types/message.dart";
import "package:flutter/material.dart";

/// A simple tile component to display a message.
class MessageTile extends StatefulWidget {
  const MessageTile({
    super.key,
    required this.message,
    required this.contact,
    this.selected = false,
    this.onTap,
  });

  /// Whether the tile is selected.
  final bool selected;

  /// Message to display.
  final Message message;

  /// Contact to display.
  final Contact contact;

  /// Called when the user taps the message tile.
  final void Function(Message message, Contact contact)? onTap;

  @override
  State<MessageTile> createState() => _MessageTileState();
}

class _MessageTileState extends State<MessageTile> {
  @override
  Widget build(BuildContext context) {
    final Contact contact = widget.contact;
    final Message message = widget.message;
    final String contactName = contact.getName();
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;

    return ListTile(
      selected: widget.selected,
      minVerticalPadding: 12,
      title: Text(contactName),
      leading: CircleAvatar(
        backgroundColor: Colors.black12,
        foregroundImage: NetworkImage(contact.avatarUrl),
      ),
      titleTextStyle: Helpers.fonts.body6(
        textStyle: TextStyle(
          fontSize: 16.0,
          color: color?.withOpacity(0.8),
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Opacity(
        opacity: 0.6,
        child: Text(
          message.subject,
          maxLines: 2,
        ),
      ),
      subtitleTextStyle: Helpers.fonts.body(
        textStyle: const TextStyle(
          fontWeight: FontWeight.w400,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 24.0,
      ),
      onTap: widget.onTap == null
          ? null
          : () => widget.onTap?.call(message, contact),
    );
  }
}

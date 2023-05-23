// ignore_for_file: public_member_api_docs, sort_constructors_first
import "dart:convert";

import "package:courrier/helpers/date_helper.dart";

class Message {
  Message({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.updatedAt,
    required this.isRead,
    required this.realtorId,
    required this.subject,
    required this.type,
    required this.contactId,
    this.isFlagged = false,
  });

  /// True if the message is read.
  final bool isRead;

  /// True if the message is flagged.
  final bool isFlagged;

  /// The id of the message.
  final String id;

  /// The body of the message.
  final String body;

  /// The date and time when the message was created.
  final DateTime createdAt;

  /// The date and time when the message was last updated.
  final DateTime updatedAt;

  /// The realtor id of the message.
  final String realtorId;

  /// The subject of the message.
  final String subject;

  /// The type of the message (e.g. email, sms, phone).
  final String type;

  /// The contact id of the message.
  final String contactId;

  Message copyWith({
    String? id,
    String? body,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool? isRead,
    String? realtorId,
    String? subject,
    String? type,
    String? contactId,
    bool? isFlagged,
  }) {
    return Message(
      id: id ?? this.id,
      body: body ?? this.body,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isRead: isRead ?? this.isRead,
      realtorId: realtorId ?? this.realtorId,
      subject: subject ?? this.subject,
      type: type ?? this.type,
      contactId: contactId ?? this.contactId,
      isFlagged: isFlagged ?? this.isFlagged,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      "body": body,
      "contact_id": contactId,
      "created_at": createdAt.millisecondsSinceEpoch,
      "id": id,
      "is_flagged": isFlagged,
      "is_read": isRead,
      "realtor_id": realtorId,
      "subject": subject,
      "type": type,
      "updated_at": updatedAt.millisecondsSinceEpoch,
    };
  }

  factory Message.empty() {
    return Message(
      id: "",
      body: "",
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
      isRead: false,
      isFlagged: false,
      realtorId: "",
      subject: "",
      type: "",
      contactId: "",
    );
  }

  factory Message.fromMap(Map<String, dynamic> map) {
    return Message(
      id: map["id"] ?? "",
      body: map["body"] ?? "",
      createdAt: DateHelper.fromFirestore(map["created_at"]),
      updatedAt: DateHelper.fromFirestore(map["updated_at"]),
      isRead: map["is_read"] ?? false,
      isFlagged: map["is_flagged"] ?? false,
      realtorId: map["realtor_id"] ?? "",
      subject: map["subject"] ?? "",
      type: map["type"] ?? "",
      contactId: map["contact_id"] ?? "",
    );
  }

  String toJson() => json.encode(toMap());

  factory Message.fromJson(String source) =>
      Message.fromMap(json.decode(source) as Map<String, dynamic>);

  @override
  String toString() {
    return "Message(id: $id, body: $body, createdAt: $createdAt, "
        "updatedAt: $updatedAt, isRead: $isRead, realtorId: $realtorId, "
        "subject: $subject, type: $type, contactId: $contactId, isFlagged: $isFlagged)";
  }

  @override
  bool operator ==(covariant Message other) {
    if (identical(this, other)) return true;

    return other.id == id &&
        other.body == body &&
        other.createdAt == createdAt &&
        other.updatedAt == updatedAt &&
        other.isRead == isRead &&
        other.isFlagged == isFlagged &&
        other.realtorId == realtorId &&
        other.subject == subject &&
        other.type == type &&
        other.contactId == contactId;
  }

  @override
  int get hashCode {
    return id.hashCode ^
        body.hashCode ^
        createdAt.hashCode ^
        updatedAt.hashCode ^
        isRead.hashCode ^
        isFlagged.hashCode ^
        realtorId.hashCode ^
        subject.hashCode ^
        type.hashCode ^
        contactId.hashCode;
  }
}

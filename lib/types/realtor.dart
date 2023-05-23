// ignore_for_file: public_member_api_docs, sort_constructors_first
import "dart:convert";

class Realtor {
  Realtor({
    required this.id,
    required this.name,
    required this.logoUrl,
    required this.unreadMessageCount,
  });

  /// The id of this realtor.
  final String id;

  /// The name of this realtor.
  final String name;

  /// The logo url of this realtor.
  final String logoUrl;

  /// The unread message count of this realtor.
  final int unreadMessageCount;

  Realtor copyWith({
    String? id,
    String? name,
    String? logoUrl,
    int? unreadMessageCount,
  }) {
    return Realtor(
      id: id ?? this.id,
      name: name ?? this.name,
      logoUrl: logoUrl ?? this.logoUrl,
      unreadMessageCount: unreadMessageCount ?? this.unreadMessageCount,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      "id": id,
      "name": name,
      "logoUrl": logoUrl,
      "unreadMessageCount": unreadMessageCount,
    };
  }

  factory Realtor.fromMap(Map<String, dynamic> map) {
    return Realtor(
      id: map["id"] as String,
      name: map["name"] as String,
      logoUrl: map["logoUrl"] as String,
      unreadMessageCount: map["unreadMessageCount"] as int,
    );
  }

  String toJson() => json.encode(toMap());

  factory Realtor.fromJson(String source) =>
      Realtor.fromMap(json.decode(source) as Map<String, dynamic>);

  @override
  String toString() {
    return "Realtor(id: $id, name: $name, logoUrl: $logoUrl, unreadMessageCount: $unreadMessageCount)";
  }

  @override
  bool operator ==(covariant Realtor other) {
    if (identical(this, other)) return true;

    return other.id == id &&
        other.name == name &&
        other.logoUrl == logoUrl &&
        other.unreadMessageCount == unreadMessageCount;
  }

  @override
  int get hashCode {
    return id.hashCode ^
        name.hashCode ^
        logoUrl.hashCode ^
        unreadMessageCount.hashCode;
  }
}

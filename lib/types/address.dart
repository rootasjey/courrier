// ignore_for_file: public_member_api_docs, sort_constructors_first
import "dart:convert";

class Address {
  Address({
    required this.postalCode,
    required this.street,
    required this.number,
  });

  final String postalCode;
  final String street;
  final int number;

  Address copyWith({
    String? postalCode,
    String? street,
    int? number,
  }) {
    return Address(
      postalCode: postalCode ?? this.postalCode,
      street: street ?? this.street,
      number: number ?? this.number,
    );
  }

  factory Address.empty() {
    return Address(
      postalCode: "",
      street: "",
      number: -1,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      "postal_code": postalCode,
      "street": street,
      "number": number,
    };
  }

  factory Address.fromMap(Map<String, dynamic> map) {
    return Address(
      postalCode: map["postal_code"] as String,
      street: map["street"] as String,
      number: map["number"] as int,
    );
  }

  String toJson() => json.encode(toMap());

  factory Address.fromJson(String source) =>
      Address.fromMap(json.decode(source) as Map<String, dynamic>);

  @override
  String toString() =>
      "Address(postalCode: $postalCode, street: $street, number: $number)";

  @override
  bool operator ==(covariant Address other) {
    if (identical(this, other)) return true;

    return other.postalCode == postalCode &&
        other.street == street &&
        other.number == number;
  }

  @override
  int get hashCode => postalCode.hashCode ^ street.hashCode ^ number.hashCode;
}

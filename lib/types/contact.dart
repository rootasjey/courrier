// ignore_for_file: public_member_api_docs, sort_constructors_first
import "dart:convert";

import "package:courrier/types/address.dart";

class Contact {
  Contact({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phone,
    required this.city,
    required this.country,
    required this.gender,
    required this.address,
    required this.avatarUrl,
  });

  final String avatarUrl;
  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String phone;
  final String city;
  final String country;
  final String gender;
  final Address address;

  Contact copyWith({
    String? id,
    String? firstName,
    String? lastName,
    String? email,
    String? phone,
    String? city,
    String? country,
    String? gender,
    Address? address,
    String? avatarUrl,
  }) {
    return Contact(
      id: id ?? this.id,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      city: city ?? this.city,
      country: country ?? this.country,
      gender: gender ?? this.gender,
      address: address ?? this.address,
    );
  }

  factory Contact.empty() {
    return Contact(
      id: "",
      avatarUrl: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      city: "",
      country: "",
      gender: "",
      address: Address.empty(),
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      "id": id,
      "avatarUrl": avatarUrl,
      "firstName": firstName,
      "lastName": lastName,
      "email": email,
      "phone": phone,
      "city": city,
      "country": country,
      "gender": gender,
      "address": address.toMap(),
    };
  }

  factory Contact.fromMap(Map<String, dynamic> map) {
    return Contact(
      id: map["id"] ?? "",
      avatarUrl: map["avatar_url"] ?? "",
      firstName: map["first_name"] ?? "",
      lastName: map["last_name"] ?? "",
      email: map["email"] ?? "",
      phone: map["phone"] ?? "",
      city: map["city"] ?? "",
      country: map["country"] ?? "",
      gender: map["gender"] ?? "",
      address: Address(
        postalCode: map["postal_code"],
        street: map["street_address"],
        number: int.tryParse(map["street_number"]) ?? -1,
      ),
    );
  }

  String getName() {
    return "$firstName $lastName";
  }

  String toJson() => json.encode(toMap());

  factory Contact.fromJson(String source) =>
      Contact.fromMap(json.decode(source) as Map<String, dynamic>);

  @override
  String toString() {
    return "Contact(id: $id, firstName: $firstName, lastName: $lastName, "
        "email: $email, phone: $phone, city: $city, country: $country, "
        "avatarUrl: $avatarUrl, gender: $gender, address: $address)";
  }

  @override
  bool operator ==(covariant Contact other) {
    if (identical(this, other)) return true;

    return other.id == id &&
        other.avatarUrl == avatarUrl &&
        other.firstName == firstName &&
        other.lastName == lastName &&
        other.email == email &&
        other.phone == phone &&
        other.city == city &&
        other.country == country &&
        other.gender == gender &&
        other.address == address;
  }

  @override
  int get hashCode {
    return id.hashCode ^
        avatarUrl.hashCode ^
        firstName.hashCode ^
        lastName.hashCode ^
        email.hashCode ^
        phone.hashCode ^
        city.hashCode ^
        country.hashCode ^
        gender.hashCode ^
        address.hashCode;
  }
}

import "package:courrier/constants/colors_constants.dart";
import "package:courrier/constants/storage_keys.dart";

/// Values in the app which do not change.
class Constants {
  /// Allowed image file extension for illustrations.
  static const List<String> allowedImageExt = [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "tiff",
  ];

  /// App name.
  static const String appName = "Courrier";

  /// App version.
  static const String appVersion = "1.0.0";

  /// Github repository URL.
  static const String githubUrl = "https://github.com/rootasjey/courrier";

  /// Twitter URL.
  static const String twitterUrl = "https://twitter.com/rootasjey";

  /// Instagram URL.
  static const String instagramUrl = "https://instagram.com/rootasjey";

  /// Website URL.
  static const String websiteUrl = "https://rootasjey.dev";

  /// All necessary colors for the app.
  static final colors = ColorsConstants();

  /// App external links.
  // static const links = LinksConstants();

  /// Unique keys to store and retrieve data from local storage.
  static const storageKeys = StorageKeys();
}

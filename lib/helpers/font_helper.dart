import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Fonts helper.
/// Make it easier to work with online Google fonts.
///
/// See https://github.com/material-foundation/google-fonts-flutter/issues/35
class FontHelper {
  const FontHelper();

  static String? fontFamily = GoogleFonts.rubik().fontFamily;

  TextStyle body({TextStyle? textStyle}) {
    return GoogleFonts.rubik(
      textStyle: textStyle,
    );
  }

  /// Return main text style for this app.
  TextStyle body2({TextStyle? textStyle}) {
    return GoogleFonts.josefinSans(
      textStyle: textStyle,
    );
  }

  TextStyle body3({TextStyle? textStyle}) {
    return GoogleFonts.lobster(
      textStyle: textStyle,
    );
  }

  TextStyle code({TextStyle? textStyle}) {
    return GoogleFonts.firaCode(
      textStyle: textStyle,
    );
  }

  TextStyle body4({TextStyle? textStyle}) {
    return GoogleFonts.poppins(
      textStyle: textStyle,
    );
  }

  TextStyle body5({TextStyle? textStyle}) {
    return GoogleFonts.rubik(
      textStyle: textStyle,
    );
  }

  /// Can be used for blog post title.
  TextStyle title({TextStyle? textStyle}) {
    return GoogleFonts.righteous(
      textStyle: textStyle,
    );
  }
}

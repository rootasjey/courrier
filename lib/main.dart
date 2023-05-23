import "dart:io";

import "package:adaptive_theme/adaptive_theme.dart";
import "package:courrier/app.dart";
import "package:courrier/firebase_options.dart";
import "package:easy_localization/easy_localization.dart";
import "package:firebase_core/firebase_core.dart";
import "package:flutter/foundation.dart";
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:loggy/loggy.dart";
import "package:url_strategy/url_strategy.dart";
import "package:window_manager/window_manager.dart";

void main() async {
  LicenseRegistry.addLicense(() async* {
    final String license = await rootBundle.loadString("google_fonts/OFL.txt");
    yield LicenseEntryWithLineBreaks(["google_fonts"], license);
  });

  WidgetsFlutterBinding.ensureInitialized();
  Loggy.initLoggy();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  await EasyLocalization.ensureInitialized();
  final AdaptiveThemeMode? savedThemeMode = await AdaptiveTheme.getThemeMode();
  setPathUrlStrategy();

  if (!kIsWeb && (Platform.isLinux || Platform.isMacOS || Platform.isWindows)) {
    await windowManager.ensureInitialized();

    windowManager.waitUntilReadyToShow(
      const WindowOptions(
        titleBarStyle: TitleBarStyle.hidden,
      ),
      () async {
        await windowManager.show();
      },
    );
  }

  if (!kIsWeb && (Platform.isAndroid || Platform.isIOS)) {
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.white,
        systemNavigationBarColor: Colors.white,
        systemNavigationBarDividerColor: Colors.transparent,
      ),
    );
  }

  return runApp(
    ProviderScope(
      child: EasyLocalization(
        path: "assets/translations",
        supportedLocales: const [Locale("en"), Locale("fr")],
        fallbackLocale: const Locale("en"),
        child: App(savedThemeMode: savedThemeMode),
      ),
    ),
  );
}

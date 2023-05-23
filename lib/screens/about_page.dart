import "package:courrier/constants.dart";
import "package:courrier/helpers.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/gestures.dart";
import "package:flutter/material.dart";
import "package:unicons/unicons.dart";
import "package:url_launcher/url_launcher.dart";

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(32.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "about".tr(),
                    style: Helpers.fonts.title(
                      textStyle: TextStyle(
                        fontSize: 24.0,
                        fontWeight: FontWeight.w600,
                        color: color?.withOpacity(0.8),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8.0),
                    child: Text(
                      "Hi, this is a demo inbox app made with Flutter.",
                      style: Helpers.fonts.body(
                        textStyle: TextStyle(
                          fontWeight: FontWeight.w400,
                          color: color?.withOpacity(0.6),
                        ),
                      ),
                    ),
                  ),
                  Text(
                    "This app is made for demonstration purpose only.",
                    style: Helpers.fonts.body(
                      textStyle: TextStyle(
                        fontWeight: FontWeight.w400,
                        color: color?.withOpacity(0.6),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 16.0),
                    child: Text(
                      "The user interface is responsive and should adapt on web and desktop.",
                      style: Helpers.fonts.body(
                        textStyle: TextStyle(
                          fontWeight: FontWeight.w400,
                          color: color?.withOpacity(0.6),
                        ),
                      ),
                    ),
                  ),
                  Text(
                    "Data is stored in Firestore and code is publicly accessible on GitHub.",
                    style: Helpers.fonts.body(
                      textStyle: TextStyle(
                        fontWeight: FontWeight.w400,
                        color: color?.withOpacity(0.6),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 24.0),
                    child: Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(
                            text: "I'm ",
                          ),
                          const TextSpan(
                            text: "Jeremie Corpinot",
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color: Colors.blue,
                            ),
                          ),
                          const TextSpan(
                            text: ". \nBrowse app code source on ",
                          ),
                          TextSpan(
                            text: "GitHub.",
                            mouseCursor: SystemMouseCursors.click,
                            recognizer: TapGestureRecognizer()
                              ..onTap = navigateToGitHub,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const TextSpan(
                            text: "\n\nYou can follow my activities on ",
                          ),
                          TextSpan(
                            text: "Instagram, ",
                            mouseCursor: SystemMouseCursors.click,
                            recognizer: TapGestureRecognizer()
                              ..onTap = navigateToInstagram,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          TextSpan(
                            text: "Twitter, ",
                            mouseCursor: SystemMouseCursors.click,
                            recognizer: TapGestureRecognizer()
                              ..onTap = navigateToTwitter,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          TextSpan(
                            text: "or my personal website.",
                            mouseCursor: SystemMouseCursors.click,
                            recognizer: TapGestureRecognizer()
                              ..onTap = navigateToWebsite,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                        style: Helpers.fonts.body(
                          textStyle: TextStyle(
                            fontWeight: FontWeight.w400,
                            color: color?.withOpacity(0.6),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const Divider(height: 64.0),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8.0),
                    child: Text(
                      "This app was made thanks to:",
                      style: Helpers.fonts.body(
                        textStyle: TextStyle(
                          fontSize: 16.0,
                          fontWeight: FontWeight.w400,
                          color: color?.withOpacity(0.4),
                        ),
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => navigateToExtLink(
                      "https://flutter.dev/",
                    ),
                    icon: const Icon(UniconsLine.paint_tool, size: 20.0),
                    label: const Text("Flutter"),
                    style: TextButton.styleFrom(
                      foregroundColor: color?.withOpacity(0.5),
                      textStyle: Helpers.fonts.body5(
                        textStyle: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 18.0,
                        ),
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => navigateToExtLink(
                      "https://firebase.google.com/",
                    ),
                    icon: const Icon(UniconsLine.cloud, size: 20.0),
                    label: const Text("Firebase"),
                    style: TextButton.styleFrom(
                      foregroundColor: color?.withOpacity(0.5),
                      textStyle: Helpers.fonts.body5(
                        textStyle: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 18.0,
                        ),
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () =>
                        navigateToExtLink("https://fonts.google.com/,"),
                    icon: const Icon(UniconsLine.font, size: 20.0),
                    label: const Text("Google Fonts"),
                    style: TextButton.styleFrom(
                      foregroundColor: color?.withOpacity(0.5),
                      textStyle: Helpers.fonts.body5(
                        textStyle: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 18.0,
                        ),
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => navigateToExtLink(
                      "https://lottiefiles.com/",
                    ),
                    icon: const Icon(UniconsLine.lottiefiles, size: 20.0),
                    label: const Text("Lottie"),
                    style: TextButton.styleFrom(
                      foregroundColor: color?.withOpacity(0.5),
                      textStyle: Helpers.fonts.body5(
                        textStyle: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 18.0,
                        ),
                      ),
                    ),
                  ),
                  lottieFileButton(
                    textValue: "mail send by Marie Esturgie",
                    url: "https://lottiefiles.com/63315-mail-send",
                    color: color,
                  ),
                  lottieFileButton(
                    textValue: "mail animation by Bhargav Savaliya",
                    url: "https://lottiefiles.com/68364-mail-animation",
                    color: color,
                  ),
                  lottieFileButton(
                    textValue: "mail animation by Ashleyy",
                    url: "https://lottiefiles.com/37799-starry-background",
                    color: color,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget lottieFileButton({
    Color? color,
    required String url,
    required String textValue,
  }) {
    return TextButton.icon(
      onPressed: () => navigateToExtLink(url),
      icon: const Icon(UniconsLine.lottiefiles_alt, size: 20.0),
      label: Text(textValue),
      style: TextButton.styleFrom(
        padding: const EdgeInsets.only(left: 16.0),
        foregroundColor: color?.withOpacity(0.5),
        textStyle: Helpers.fonts.body5(
          textStyle: const TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 18.0,
          ),
        ),
      ),
    );
  }

  void navigateToExtLink(String url) async {
    final extLink = Uri.parse(url);
    await launchUrl(extLink);
  }

  void navigateToGitHub() {
    launchUrl(Uri.parse(Constants.githubUrl));
  }

  void navigateToWebsite() {
    launchUrl(Uri.parse(Constants.websiteUrl));
  }

  void navigateToTwitter() {
    launchUrl(Uri.parse(Constants.twitterUrl));
  }

  void navigateToInstagram() {
    launchUrl(Uri.parse(Constants.instagramUrl));
  }
}

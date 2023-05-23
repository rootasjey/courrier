import "package:courrier/components/fade_in_y.dart";
import "package:courrier/constants.dart";
import "package:courrier/helpers.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:jiffy/jiffy.dart";
import "package:lottie/lottie.dart";

/// Empty view to display when therer's no message selected.
class EmptyMessageContentView extends StatelessWidget {
  const EmptyMessageContentView({
    super.key,
    this.pageDataFilter = PageDataFilter.inbox,
  });

  /// Tell us which type of data has been fetched
  /// (e.g. inbox, arvhied, deleted, ...).
  final PageDataFilter pageDataFilter;

  @override
  Widget build(BuildContext context) {
    final Color? color = Theme.of(context).textTheme.bodyMedium?.color;
    final Size size = MediaQuery.of(context).size;
    const double beginY = 24.0;

    return Stack(
      children: [
        Opacity(
          opacity: 1.0,
          child: Lottie.asset(
            "assets/animations/starry-background.json",
            fit: BoxFit.cover,
            width: size.width,
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.max,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FadeInY(
                beginY: beginY,
                delay: const Duration(milliseconds: 0),
                child: Text(
                  getTitle(),
                  textAlign: TextAlign.center,
                  style: Helpers.fonts.body5(
                    textStyle: TextStyle(
                      color: color?.withOpacity(0.6),
                      fontSize: 42.0,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              FadeInY(
                beginY: beginY,
                delay: const Duration(milliseconds: 24),
                child: Text(
                  getDescription(),
                  textAlign: TextAlign.center,
                  style: Helpers.fonts.body(
                    textStyle: TextStyle(
                      color: color?.withOpacity(0.4),
                      fontSize: 24.0,
                      fontWeight: FontWeight.w200,
                    ),
                  ),
                ),
              ),
              StreamBuilder(
                  stream: Stream.periodic(const Duration(minutes: 1)),
                  builder: (BuildContext context, snapshot) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 12.0),
                      child: Column(
                        children: [
                          FadeInY(
                            beginY: beginY,
                            delay: const Duration(milliseconds: 100),
                            child: Text(
                              Jiffy(DateTime.now()).format("hh:mm a"),
                              style: Helpers.fonts.body2(
                                textStyle: TextStyle(
                                  fontSize: 24.0,
                                  color: color?.withOpacity(0.6),
                                ),
                              ),
                            ),
                          ),
                          FadeInY(
                            beginY: beginY,
                            delay: const Duration(milliseconds: 124),
                            child: Text(
                              Jiffy(DateTime.now()).format("dd MMM yyyy"),
                              style: Helpers.fonts.body5(
                                textStyle: TextStyle(
                                  fontSize: 12.0,
                                  color: color?.withOpacity(0.3),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  })
            ],
          ),
        ),
        Positioned(
          bottom: 8.0,
          left: 0.0,
          right: 0.0,
          child: Center(
            child: Tooltip(
              message: "Application version: ${Constants.appVersion}",
              child: TextButton(
                onPressed: () {},
                child: Text(
                  Constants.appVersion,
                  style: Helpers.fonts.body5(
                    textStyle: TextStyle(
                      color: color?.withOpacity(0.6),
                      fontSize: 12.0,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  String getTitle() {
    switch (pageDataFilter) {
      case PageDataFilter.archived:
        return "empty_view_title.${pageDataFilter.name}".tr();
      case PageDataFilter.deleted:
        return "empty_view_title.${pageDataFilter.name}".tr();
      case PageDataFilter.flagged:
        return "empty_view_title.${pageDataFilter.name}".tr();
      case PageDataFilter.inbox:
        return "empty_view_title.${pageDataFilter.name}".tr();
      default:
        return "empty_view_title.${pageDataFilter.name}".tr();
    }
  }

  String getDescription() {
    switch (pageDataFilter) {
      case PageDataFilter.archived:
        return "empty_view_description.${pageDataFilter.name}".tr();
      case PageDataFilter.deleted:
        return "empty_view_description.${pageDataFilter.name}".tr();
      case PageDataFilter.flagged:
        return "empty_view_description.${pageDataFilter.name}".tr();
      case PageDataFilter.inbox:
        return "empty_view_description.${pageDataFilter.name}".tr();
      default:
        return "empty_view_description.${pageDataFilter.name}".tr();
    }
  }
}

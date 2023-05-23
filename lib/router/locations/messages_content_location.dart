import "package:beamer/beamer.dart";
import "package:courrier/screens/message_content_page.dart";
import "package:courrier/types/enums/enum_page_data_filter.dart";
import "package:flutter/widgets.dart";

class MessagesContentLocation extends BeamLocation<BeamState> {
  MessagesContentLocation(RouteInformation routeInformation)
      : super(routeInformation);

  /// Inbox route location.
  static const String route = "/inbox";

  /// All messages route location.
  static const String messagesRoute = "$route/messages";

  /// Single message route location.
  static const String messageRoute = "$messagesRoute/:messageId";

  @override
  List<Pattern> get pathPatterns => [
        route,
        messagesRoute,
        messageRoute,
      ];

  @override
  List<BeamPage> buildPages(BuildContext context, BeamState state) {
    final String selectedMessageId =
        state.pathPatternSegments.contains(":messageId")
            ? state.pathParameters["messageId"] as String
            : "";

    var pageDataFilter = PageDataFilter.inbox;
    if (state.routeState != null) {
      final map = state.routeState as Map<String, dynamic>;
      if (map.containsKey("filter")) {
        final index = map["filter"] as int;
        pageDataFilter = PageDataFilter.values.firstWhere(
          (x) => x.index == index,
          orElse: () => PageDataFilter.inbox,
        );
      }
    }

    return [
      BeamPage(
        child: MessageContentPage(
          selectedMessageId: selectedMessageId,
          pageDataFilter: pageDataFilter,
        ),
        key: ValueKey("$messagesRoute/$selectedMessageId"),
        // key: const ValueKey(messagesRoute),
        title: "Messages",
        type: BeamPageType.fadeTransition,
      ),
    ];
  }
}

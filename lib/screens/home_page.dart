import 'package:adaptive_theme/adaptive_theme.dart';
import 'package:courrier/helpers.dart';
import 'package:flutter/material.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          SizedBox(
            width: 200.0,
            child: Row(
              children: [
                Column(
                  children: const [
                    Text("searchfefeferfe"),
                  ],
                ),
                const VerticalDivider(
                  thickness: 1.0,
                ),
              ],
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  "home",
                  style: Helpers.fonts.title(
                    textStyle: const TextStyle(fontSize: 42.0),
                  ),
                ),
                Text(
                  "This is a body",
                  style: Helpers.fonts.body(
                    textStyle: const TextStyle(fontSize: 24.0),
                  ),
                ),
                ElevatedButton(
                  onPressed: () {
                    AdaptiveTheme.of(context).setLight();
                  },
                  child: const Text("set light theme"),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

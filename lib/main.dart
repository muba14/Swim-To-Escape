import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

/// Swim to Escape: Octopus
///
/// Hybrid app: the whole game (engine, levels, music, sound) is a single
/// offline HTML file in assets/game/index.html, built by tools/build_web.py.
/// This Flutter shell shows it full-screen and gives it what a web page
/// cannot do on its own:
///   * SaveChannel    -> progress is stored in SharedPreferences
///   * HapticChannel  -> vibration on hits, pickups and swipes
///   * Android back button -> handled by the game (pause / previous screen)
///   * app goes to background -> game pauses and audio stops
const _saveKey = 'swim_to_escape_save_v2';
const _bg = Color(0xFF0B141B);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  final prefs = await SharedPreferences.getInstance();
  runApp(SwimApp(prefs: prefs));
}

class SwimApp extends StatelessWidget {
  final SharedPreferences prefs;
  const SwimApp({super.key, required this.prefs});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Swim to Escape: Octopus',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark().copyWith(scaffoldBackgroundColor: _bg),
        home: GameHost(prefs: prefs),
      );
}

class GameHost extends StatefulWidget {
  final SharedPreferences prefs;
  const GameHost({super.key, required this.prefs});

  @override
  State<GameHost> createState() => _GameHostState();
}

class _GameHostState extends State<GameHost> with WidgetsBindingObserver {
  late final WebViewController _web;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    PlatformWebViewControllerCreationParams params =
        const PlatformWebViewControllerCreationParams();
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      // iOS: let Web Audio play without an extra tap and keep it inline.
      params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
    }

    _web = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(_bg)
      ..addJavaScriptChannel('SaveChannel',
          onMessageReceived: (m) => widget.prefs.setString(_saveKey, m.message))
      ..addJavaScriptChannel('HapticChannel',
          onMessageReceived: (m) => _haptic(m.message))
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) => _onLoaded(),
        // the game never navigates away; block anything that tries to
        onNavigationRequest: (r) =>
            r.url.startsWith('file:') || r.url.startsWith('about:')
                ? NavigationDecision.navigate
                : NavigationDecision.prevent,
      ));

    final platform = _web.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
    }
    _web.loadFlutterAsset('assets/game/index.html');
  }

  Future<void> _onLoaded() async {
    final saved = widget.prefs.getString(_saveKey);
    if (saved != null) {
      // jsonEncode turns the saved JSON text into a safe JS string literal
      await _web.runJavaScript('window.__nativeLoad(${jsonEncode(saved)})');
    }
    if (mounted) setState(() => _loaded = true);
  }

  void _haptic(String kind) {
    switch (kind) {
      case 'light':
        HapticFeedback.lightImpact();
      case 'medium':
        HapticFeedback.mediumImpact();
      case 'heavy':
        HapticFeedback.heavyImpact();
      default:
        HapticFeedback.selectionClick();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _web.runJavaScript('window.__onResume && window.__onResume()');
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _web.runJavaScript('window.__onPause && window.__onPause()');
    }
  }

  Future<void> _onBack() async {
    final handled = await _web.runJavaScriptReturningResult(
        'window.__onBack ? window.__onBack() : false');
    // Android returns a bool, iOS may return 1/0 or a string
    final yes = handled == true || handled == 1 || handled.toString() == 'true';
    if (!yes) SystemNavigator.pop();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _onBack();
      },
      child: Scaffold(
        backgroundColor: _bg,
        body: Stack(
          children: [
            Positioned.fill(child: WebViewWidget(controller: _web)),
            if (!_loaded)
              Positioned.fill(
                child: ColoredBox(
                  color: _bg,
                  child: Center(
                    child: Image.asset('assets/logo.png',
                        width: 160, filterQuality: FilterQuality.none),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

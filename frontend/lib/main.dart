import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: DashboardScaffold(),
    );
  }
}

/// The pages the sidebar can navigate between.
enum DashboardPage { home, contentSchedule, analytics }

/// Owns "which page is selected" and lays out the sidebar
/// next to whatever page is currently active.
class DashboardScaffold extends StatefulWidget {
  const DashboardScaffold({super.key});

  @override
  State<DashboardScaffold> createState() => _DashboardScaffoldState();
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 20, 0, 0),
      child: Text('Home',style: TextStyle(fontSize: 24),),
      
      
    );
  }
}

class ContentSchedulePage extends StatelessWidget {
  const ContentSchedulePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [ 
        Container(
          padding: const EdgeInsets.fromLTRB(20, 20, 0, 0),
          child: Text('Content Schedule', style: TextStyle(fontSize: 24))
        ),
        Container(
          child: Column(
            
          )
        )
      ]
    );
  }
}

class AnalyticsPage extends StatelessWidget {
  const AnalyticsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 20, 0, 0),
      child: Text('Analytics', style: TextStyle(fontSize: 24)),
      // build out your real Analytics content here
    );
  }
}

class _DashboardScaffoldState extends State<DashboardScaffold> {
  DashboardPage _selectedPage = DashboardPage.home;

  Widget _buildPageContent() {
    switch (_selectedPage) {
      case DashboardPage.home:
        return const HomePage();
      case DashboardPage.contentSchedule:
        return const ContentSchedulePage();
      case DashboardPage.analytics:
        return const AnalyticsPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color.fromARGB(255, 202, 252, 241),
        title: const Text(
          'Influencer Dashboard',
          style: TextStyle(fontSize: 30),
        ),
      ),
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Sidebar(
            selectedPage: _selectedPage,
            onPageSelected: (page) {
              setState(() {
                _selectedPage = page;
              });
            },
          ),
          Expanded(
            child: _buildPageContent(),
          ),
        ],
      ),
    );
  }
}

class Sidebar extends StatefulWidget {
  final DashboardPage selectedPage;
  final ValueChanged<DashboardPage> onPageSelected;

  const Sidebar({
    super.key,
    required this.selectedPage,
    required this.onPageSelected,
  });

  @override
  State<Sidebar> createState() => _SidebarState();
}

class _SidebarState extends State<Sidebar> {
  bool _isExpanded = false;

  static const double _collapsedWidth = 50;
  static const double _expandedWidth = 200;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeIn,
      width: _isExpanded ? _expandedWidth : _collapsedWidth,
      color: const Color.fromARGB(255, 199, 240, 255),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // The tiny arrow toggle button
          Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              iconSize: 16,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(
                minWidth: 32,
                minHeight: 32,
              ),
              splashRadius: 16,
              icon: Icon(
                _isExpanded ? Icons.arrow_back_ios : Icons.arrow_forward_ios,
              ),
              onPressed: () {
                setState(() {
                  _isExpanded = !_isExpanded;
                });
              },
            ),
          ),
          if (_isExpanded) ...[
            _SidebarItem(
              label: 'Home',
              isSelected: widget.selectedPage == DashboardPage.home,
              onTap: () => widget.onPageSelected(DashboardPage.home),
            ),
            _SidebarItem(
              label: 'Content Schedule',
              isSelected:
                  widget.selectedPage == DashboardPage.contentSchedule,
              onTap: () =>
                  widget.onPageSelected(DashboardPage.contentSchedule),
            ),
            _SidebarItem(
              label: 'Analytics',
              isSelected: widget.selectedPage == DashboardPage.analytics,
              onTap: () => widget.onPageSelected(DashboardPage.analytics),
            ),
          ],
        ],
      ),
    );
  }
}

class _SidebarItem extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _SidebarItem({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      child: TextButton(
        style: TextButton.styleFrom(
          foregroundColor:
              isSelected ? Colors.blue.shade900 : Colors.blueGrey,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(2)),
          ),
        ),
        onPressed: onTap,
        child: Text(label, style: const TextStyle(fontSize: 16)),
      ),
    );
  }
}


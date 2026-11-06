import 'package:flutter/material.dart';
import 'app_colors.dart';

class AppTheme {
  static ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: const ColorScheme.light(
      primary: AppColors.emerald600,
      secondary: AppColors.emerald700,
      surface: Colors.white,
      background: AppColors.slate50,
      error: AppColors.rose600,
    ),
    scaffoldBackgroundColor: AppColors.slate50,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        color: AppColors.slate900,
        fontSize: 18,
        fontWeight: FontWeight.bold,
        fontFamily: 'Cairo',
      ),
    ),
    fontFamily: 'Cairo',
  );

  static ThemeData darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.emerald600,
      secondary: AppColors.emerald50,
      surface: AppColors.slate900,
      background: AppColors.slate950,
      error: AppColors.rose600,
    ),
    scaffoldBackgroundColor: AppColors.slate900,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.slate900,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        color: AppColors.slate50,
        fontSize: 18,
        fontWeight: FontWeight.bold,
        fontFamily: 'Cairo',
      ),
    ),
    fontFamily: 'Cairo',
  );
}

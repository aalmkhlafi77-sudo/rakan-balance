import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../models/account_model.dart';
import '../models/transaction_model.dart';
import 'balance_calculator.dart';
import 'money_utils.dart';

class StatementPdfRow {
  final String date;
  final String description;
  final int owedByMinor;
  final int owedToMinor;
  final int runningBalanceMinor;

  const StatementPdfRow({
    required this.date,
    required this.description,
    required this.owedByMinor,
    required this.owedToMinor,
    required this.runningBalanceMinor,
  });
}

class StatementPdfData {
  final String accountName;
  final String accountId;
  final String fromLabel;
  final String toLabel;
  final int openingBalanceMinor;
  final int totalOwedByMinor;
  final int totalOwedToMinor;
  final int closingBalanceMinor;
  final List<StatementPdfRow> rows;

  const StatementPdfData({
    required this.accountName,
    required this.accountId,
    required this.fromLabel,
    required this.toLabel,
    required this.openingBalanceMinor,
    required this.totalOwedByMinor,
    required this.totalOwedToMinor,
    required this.closingBalanceMinor,
    required this.rows,
  });
}

/// Builds the printable account statement from the same exact financial
/// calculator used by the mobile UI. Private account notes and transaction
/// notes are intentionally never copied into [StatementPdfData].
class AccountStatementPdf {
  static StatementPdfData buildData({
    required AccountModel account,
    required Iterable<AccountModel> accounts,
    required Iterable<TransactionModel> transactions,
    String? fromDate,
    String? toDate,
  }) {
    final statement = BalanceCalculator.calculateAccountStatement(
      account: account,
      transactions: transactions.toList(),
      fromDate: fromDate,
      toDate: toDate,
    );
    final directory = {
      for (final candidate in accounts) candidate.id: candidate,
    };

    final rows = statement.rows.map((row) {
      final tx = row.transaction;
      var description = tx.description;
      if (tx.transferId != null && tx.counterpartyAccountId != null) {
        final counterparty = directory[tx.counterpartyAccountId!];
        if (counterparty != null) {
          final relation = tx.transferRole == TransferRole.source
              ? 'نقل مديونية إلى: '
              : 'مديونية محولة من: ';
          description = '$description ($relation${counterparty.name})';
        }
      }
      return StatementPdfRow(
        date: tx.date,
        description: description,
        owedByMinor:
            tx.entryType == EntryType.owedByAccount ? tx.amountMinor : 0,
        owedToMinor:
            tx.entryType == EntryType.owedToAccount ? tx.amountMinor : 0,
        runningBalanceMinor: row.runningBalanceMinor,
      );
    }).toList(growable: false);

    return StatementPdfData(
      accountName: account.name,
      accountId: account.id,
      fromLabel:
          fromDate == null || fromDate.isEmpty ? 'بداية التعامل' : fromDate,
      toLabel: toDate == null || toDate.isEmpty ? 'آخر السجل' : toDate,
      openingBalanceMinor: statement.openingBalanceMinor,
      totalOwedByMinor: statement.totalOwedByMinor,
      totalOwedToMinor: statement.totalOwedToMinor,
      closingBalanceMinor: statement.closingBalanceMinor,
      rows: rows,
    );
  }

  static String fileName({
    required AccountModel account,
    String? fromDate,
    String? toDate,
  }) {
    final safeId = account.id.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    final range = fromDate == null && toDate == null
        ? 'all'
        : '${fromDate ?? 'start'}_${toDate ?? 'end'}';
    return 'rakan_statement_${safeId}_$range.pdf';
  }

  static Future<Uint8List> buildBytes({
    required AccountModel account,
    required Iterable<AccountModel> accounts,
    required Iterable<TransactionModel> transactions,
    String? fromDate,
    String? toDate,
    PdfPageFormat pageFormat = PdfPageFormat.a4,
  }) async {
    final data = buildData(
      account: account,
      accounts: accounts,
      transactions: transactions,
      fromDate: fromDate,
      toDate: toDate,
    );

    // PdfGoogleFonts caches downloaded fonts by default. Amiri provides full
    // Arabic shaping support while keeping the generated document portable.
    final regular = await PdfGoogleFonts.amiriRegular();
    final bold = await PdfGoogleFonts.amiriBold();
    final theme = pw.ThemeData.withFont(base: regular, bold: bold);
    final document = pw.Document();

    pw.Widget rtl(pw.Widget child) =>
        pw.Directionality(textDirection: pw.TextDirection.rtl, child: child);

    pw.Widget metric(String label, int value) => pw.Expanded(
          child: pw.Container(
            padding: const pw.EdgeInsets.all(8),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey300),
              borderRadius: pw.BorderRadius.circular(4),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(label, style: const pw.TextStyle(fontSize: 9)),
                pw.SizedBox(height: 3),
                pw.Text(
                  '${MoneyUtils.formatMinorAmount(value)} ر.س',
                  style: const pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold),
                ),
              ],
            ),
          ),
        );

    final tableRows = <pw.TableRow>[
      pw.TableRow(
        decoration: const pw.BoxDecoration(color: PdfColors.grey200),
        children: [
          'الرصيد بعد الحركة',
          'له (عليك)',
          'عليه (لك)',
          'البيان',
          'التاريخ',
          'م',
        ]
            .map((text) => pw.Padding(
                  padding: const pw.EdgeInsets.all(5),
                  child: pw.Text(
                    text,
                    textAlign: pw.TextAlign.center,
                    style: const pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 8),
                  ),
                ))
            .toList(),
      ),
    ];

    for (var index = 0; index < data.rows.length; index++) {
      final row = data.rows[index];
      tableRows.add(
        pw.TableRow(
          children: [
            MoneyUtils.formatMinorAmount(row.runningBalanceMinor),
            row.owedToMinor == 0
                ? '—'
                : MoneyUtils.formatMinorAmount(row.owedToMinor),
            row.owedByMinor == 0
                ? '—'
                : MoneyUtils.formatMinorAmount(row.owedByMinor),
            row.description,
            row.date,
            '${index + 1}',
          ]
              .map((text) => pw.Padding(
                    padding: const pw.EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 5,
                    ),
                    child: pw.Text(
                      text,
                      textAlign: pw.TextAlign.center,
                      style: const pw.TextStyle(fontSize: 8),
                    ),
                  ))
              .toList(),
        ),
      );
    }

    document.addPage(
      pw.MultiPage(
        pageFormat: pageFormat,
        theme: theme,
        margin: const pw.EdgeInsets.all(28),
        build: (context) => [
          rtl(
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'راكان بلانس | RAKAN BALANCE',
                  style: const pw.TextStyle(
                    fontSize: 10,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 4),
                pw.Text(
                  'كشف حساب: ${data.accountName}',
                  style: const pw.TextStyle(
                    fontSize: 18,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 3),
                pw.Text(
                  'الفترة: ${data.fromLabel} إلى ${data.toLabel} · العملة: ريال سعودي (SAR)',
                  style: const pw.TextStyle(fontSize: 9),
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 14),
          rtl(
            pw.Row(
              children: [
                metric('رصيد أول المدة', data.openingBalanceMinor),
                pw.SizedBox(width: 6),
                metric('إجمالي عليه', data.totalOwedByMinor),
              ],
            ),
          ),
          pw.SizedBox(height: 6),
          rtl(
            pw.Row(
              children: [
                metric('إجمالي له', -data.totalOwedToMinor),
                pw.SizedBox(width: 6),
                metric('رصيد آخر المدة', data.closingBalanceMinor),
              ],
            ),
          ),
          pw.SizedBox(height: 14),
          if (data.rows.isEmpty)
            rtl(
              pw.Container(
                width: double.infinity,
                padding: const pw.EdgeInsets.all(18),
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: PdfColors.grey300),
                ),
                child: pw.Text(
                  'لا توجد حركات مسجلة خلال الفترة المحددة.',
                  textAlign: pw.TextAlign.center,
                ),
              ),
            )
          else
            rtl(
              pw.Table(
                border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
                columnWidths: const {
                  0: pw.FlexColumnWidth(1.25),
                  1: pw.FlexColumnWidth(0.9),
                  2: pw.FlexColumnWidth(0.9),
                  3: pw.FlexColumnWidth(2.6),
                  4: pw.FlexColumnWidth(1.1),
                  5: pw.FlexColumnWidth(0.45),
                },
                children: tableRows,
              ),
            ),
          pw.SizedBox(height: 14),
          rtl(
            pw.Text(
              'تم استخراج هذا الكشف من تطبيق راكان بلانس. لا يتضمن هذا المستند الملاحظات الخاصة.',
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
            ),
          ),
        ],
        footer: (context) => rtl(
          pw.Align(
            alignment: pw.Alignment.center,
            child: pw.Text(
              'صفحة ${context.pageNumber} من ${context.pagesCount}',
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
            ),
          ),
        ),
      ),
    );

    return document.save();
  }

  static Future<void> printStatement({
    required AccountModel account,
    required Iterable<AccountModel> accounts,
    required Iterable<TransactionModel> transactions,
    String? fromDate,
    String? toDate,
  }) async {
    await Printing.layoutPdf(
      onLayout: (format) => buildBytes(
        account: account,
        accounts: accounts,
        transactions: transactions,
        fromDate: fromDate,
        toDate: toDate,
        pageFormat: format,
      ),
    );
  }

  static Future<void> shareStatement({
    required AccountModel account,
    required Iterable<AccountModel> accounts,
    required Iterable<TransactionModel> transactions,
    String? fromDate,
    String? toDate,
  }) async {
    final bytes = await buildBytes(
      account: account,
      accounts: accounts,
      transactions: transactions,
      fromDate: fromDate,
      toDate: toDate,
    );
    await Printing.sharePdf(
      bytes: bytes,
      filename: fileName(
        account: account,
        fromDate: fromDate,
        toDate: toDate,
      ),
    );
  }
}

import io
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple
import pandas as pd

from app.services.quality import QualityScoreService

logger = logging.getLogger(__name__)


class ReportGeneratorService:
    """
    Generates HTML and PDF quality audit reports from dataset operation logs.
    """

    @classmethod
    def _compute_report_metrics(cls, session) -> Dict[str, Any]:
        """
        Computes before/after rows, quality scores, issues fixed, and operation details.
        """
        initial_df = session.original_df
        current_df = session.df
        filename = session.metadata.get("filename", f"dataset_{session.dataset_id}")

        rows_before = len(initial_df)
        rows_after = len(current_df)

        # Quality scores
        quality_before = QualityScoreService.compute(initial_df)
        quality_after = QualityScoreService.compute(current_df)

        # Issues fixed
        total_affected_rows = sum(rec.affected_row_count for rec.history_step in [session.history] for rec in rec) if False else sum(rec.affected_row_count for rec in session.history)

        applied_ops = []
        for idx, rec in enumerate(session.history, 1):
            applied_ops.append({
                "step": idx,
                "operation": rec.operation,
                "column": rec.params.get("column") or rec.params.get("old_name") or rec.params.get("new_column") or "N/A",
                "method": rec.params.get("method") or rec.params.get("operation") or rec.params.get("action") or "N/A",
                "affected_rows": rec.affected_row_count,
                "applied_at": rec.applied_at,
            })

        return {
            "dataset_id": session.dataset_id,
            "filename": filename,
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "rows_before": rows_before,
            "rows_after": rows_after,
            "total_operations": len(session.history),
            "total_affected_rows": total_affected_rows,
            "quality_before": quality_before,
            "quality_after": quality_after,
            "applied_ops": applied_ops,
        }

    @classmethod
    def generate_html_report(cls, session) -> str:
        """
        Generates a standalone, responsive HTML data quality report with print CSS styling.
        """
        m = cls._compute_report_metrics(session)

        # Sub-score rows
        before_sub_dict = {s["name"]: s["score"] for s in m["quality_before"]["sub_scores"]}
        after_sub_dict = {s["name"]: s["score"] for s in m["quality_after"]["sub_scores"]}

        sub_rows_html = ""
        for name in ["completeness", "consistency", "validity", "uniqueness"]:
            b_val = round(before_sub_dict.get(name, 0) * 100, 1)
            a_val = round(after_sub_dict.get(name, 0) * 100, 1)
            diff = round(a_val - b_val, 1)
            diff_str = f"+{diff}%" if diff > 0 else f"{diff}%" if diff < 0 else "0%"
            diff_color = "#10b981" if diff > 0 else "#f43f5e" if diff < 0 else "#64748b"

            sub_rows_html += f"""
            <tr>
              <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-transform: capitalize;">{name}</td>
              <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace;">{b_val}%</td>
              <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700;">{a_val}%</td>
              <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; color: {diff_color}; font-weight: 700;">{diff_str}</td>
            </tr>
            """

        ops_html = ""
        if not m["applied_ops"]:
            ops_html = '<p style="color: #64748b; font-style: italic;">No cleaning operations were applied to this dataset.</p>'
        else:
            ops_html = '<ul style="padding-left: 20px; line-height: 1.8;">'
            for op in m["applied_ops"]:
                ops_html += f"""
                <li style="margin-bottom: 8px;">
                  <strong>Step {op['step']}: {op['operation'].replace('_', ' ').title()}</strong>
                  on column <code style="background: #f1f5f9; padding: 2px 6px; borderRadius: 4px;">{op['column']}</code>
                  (method: <em>{op['method']}</em>) — <strong>{op['affected_rows']}</strong> row(s) affected
                  <span style="color: #94a3b8; font-size: 11px; margin-left: 8px;">({op['applied_at']})</span>
                </li>
                """
            ops_html += '</ul>'

        overall_before_pct = round(m["quality_before"]["overall_score"] * 100, 1)
        overall_after_pct = round(m["quality_after"]["overall_score"] * 100, 1)

        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CleanIQ Quality Audit Report - {m['filename']}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 40px 20px; }}
    .report-card {{ max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); padding: 40px; }}
    .header {{ border-bottom: 2px solid #ff6a3d; padding-bottom: 24px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }}
    .badge {{ background: rgba(255, 106, 61, 0.12); color: #ff6a3d; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; margin-bottom: 6px; }}
    .metrics-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 30px; }}
    .metric-box {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }}
    .metric-title {{ font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }}
    .metric-value {{ font-size: 26px; font-weight: 800; color: #0f172a; font-family: monospace; }}
    table {{ width: 100%; border-collapse: collapse; margin-bottom: 30px; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }}
    th {{ background: #f1f5f9; padding: 12px 14px; font-size: 12px; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }}
    h2 {{ font-size: 18px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px; margin-bottom: 16px; }}
    @media print {{ body {{ background: #fff; padding: 0; }} .report-card {{ border: none; box-shadow: none; padding: 0; }} }}
  </style>
</head>
<body>
  <div class="report-card">
    <div class="header">
      <div>
        <div style="margin-bottom: 14px;">
          <svg width="180" height="44" viewBox="0 0 260 64" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="8" width="48" height="48" rx="12" fill="#FF6A3D"/>
            <path d="M14 32 L21.5 39.5 L36 20" stroke="#FFFFFF" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <text x="62" y="42" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="28" fill="#171717">Clean<tspan fill="#FF6A3D">IQ</tspan></text>
          </svg>
        </div>
        <span class="badge">CleanIQ Audit Report</span>
        <h1 style="font-size: 24px; margin: 8px 0 4px 0; color: #0f172a;">{m['filename']}</h1>
        <p style="font-size: 12px; color: #64748b; margin: 0;">Dataset ID: {m['dataset_id']} &bull; Generated: {m['generated_at']}</p>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700;">Overall Score</div>
        <div style="font-size: 32px; font-weight: 900; color: #ff6a3d;">{overall_after_pct}%</div>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-box">
        <div class="metric-title">Row Count</div>
        <div class="metric-value">{m['rows_before']} &rarr; {m['rows_after']}</div>
      </div>
      <div class="metric-box">
        <div class="metric-title">Operations Logged</div>
        <div class="metric-value">{m['total_operations']}</div>
      </div>
      <div class="metric-box">
        <div class="metric-title">Total Cells Affected</div>
        <div class="metric-value">{m['total_affected_rows']}</div>
      </div>
    </div>

    <h2>Quality Dimensions Comparison</h2>
    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Dimension</th>
          <th>Before Clean</th>
          <th>After Clean</th>
          <th>Net Gain</th>
        </tr>
      </thead>
      <tbody>
        {sub_rows_html}
      </tbody>
    </table>

    <h2>Applied Operations Log</h2>
    {ops_html}

    <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; pt-20px; font-size: 11px; color: #94a3b8; text-align: center; padding-top: 16px;">
      Generated automatically by CleanIQ Data Cleaning & Profiling Engine
    </div>
  </div>
</body>
</html>"""
        return html_content

    @classmethod
    def generate_pdf_report(cls, session) -> bytes:
        """
        Generates a PDF data quality report using reportlab.
        """
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

            m = cls._compute_report_metrics(session)
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)

            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                'ReportTitle',
                parent=styles['Heading1'],
                fontSize=20,
                leading=24,
                textColor=colors.HexColor('#0f172a'),
                spaceAfter=4,
            )
            subtitle_style = ParagraphStyle(
                'ReportSubTitle',
                parent=styles['Normal'],
                fontSize=9,
                textColor=colors.HexColor('#64748b'),
                spaceAfter=15,
            )
            h2_style = ParagraphStyle(
                'ReportH2',
                parent=styles['Heading2'],
                fontSize=14,
                leading=18,
                textColor=colors.HexColor('#1e293b'),
                spaceBefore=15,
                spaceAfter=10,
            )
            body_style = ParagraphStyle('ReportBody', parent=styles['Normal'], fontSize=9, leading=13, textColor=colors.HexColor('#334155'))

            story = []

            # Logo & Header
            from reportlab.graphics.shapes import Drawing, Rect, PolyLine, String
            logo_d = Drawing(140, 34)
            logo_d.add(Rect(0, 5, 24, 24, rx=6, ry=6, fillColor=colors.HexColor('#FF6A3D'), strokeColor=None))
            logo_d.add(PolyLine([(7, 17), (11, 13), (18, 22)], strokeColor=colors.HexColor('#FFFFFF'), strokeWidth=2.3, strokeLineCap=1, strokeLineJoin=1))
            logo_d.add(String(32, 10, "Clean", fontName="Helvetica-Bold", fontSize=16, fillColor=colors.HexColor('#171717')))
            logo_d.add(String(77, 10, "IQ", fontName="Helvetica-Bold", fontSize=16, fillColor=colors.HexColor('#FF6A3D')))
            story.append(logo_d)
            story.append(Spacer(1, 8))

            story.append(Paragraph(f"CleanIQ Quality Audit Report — {m['filename']}", title_style))
            story.append(Paragraph(f"Dataset ID: {m['dataset_id']} | Generated: {m['generated_at']}", subtitle_style))
            story.append(Spacer(1, 10))

            # Summary Table
            overall_b = round(m["quality_before"]["overall_score"] * 100, 1)
            overall_a = round(m["quality_after"]["overall_score"] * 100, 1)

            summary_data = [
                ["Rows (Before / After)", "Operations Logged", "Total Affected Rows", "Quality Score (Before / After)"],
                [f"{m['rows_before']} → {m['rows_after']}", f"{m['total_operations']}", f"{m['total_affected_rows']}", f"{overall_b}% → {overall_a}%"]
            ]
            summary_table = Table(summary_data, colWidths=[135, 120, 120, 165])
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#475569')),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('FONTSIZE', (0, 1), (-1, 1), 11),
                ('TEXTCOLOR', (0, 1), (-1, 1), colors.HexColor('#0f172a')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
            ]))
            story.append(summary_table)
            story.append(Spacer(1, 15))

            # Quality Dimensions Table
            story.append(Paragraph("Quality Dimensions Comparison", h2_style))

            before_sub_dict = {s["name"]: s["score"] for s in m["quality_before"]["sub_scores"]}
            after_sub_dict = {s["name"]: s["score"] for s in m["quality_after"]["sub_scores"]}

            dim_data = [["Dimension", "Before Clean", "After Clean", "Net Gain"]]
            for name in ["completeness", "consistency", "validity", "uniqueness"]:
                b_val = round(before_sub_dict.get(name, 0) * 100, 1)
                a_val = round(after_sub_dict.get(name, 0) * 100, 1)
                diff = round(a_val - b_val, 1)
                diff_str = f"+{diff}%" if diff > 0 else f"{diff}%" if diff < 0 else "0%"
                dim_data.append([name.capitalize(), f"{b_val}%", f"{a_val}%", diff_str])

            dim_table = Table(dim_data, colWidths=[140, 130, 130, 140])
            dim_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4f46e5')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(dim_table)
            story.append(Spacer(1, 15))

            # Applied Operations List
            story.append(Paragraph("Applied Operations Log", h2_style))
            if not m["applied_ops"]:
                story.append(Paragraph("No cleaning operations were applied to this dataset.", body_style))
            else:
                list_items = []
                for op in m["applied_ops"]:
                    text = f"<b>Step {op['step']}: {op['operation'].replace('_', ' ').title()}</b> on column <i>{op['column']}</i> (method: {op['method']}) — <b>{op['affected_rows']}</b> row(s) affected"
                    list_items.append(ListItem(Paragraph(text, body_style), leftIndent=15, bulletOffsetY=-2))
                story.append(ListFlowable(list_items, bulletType='bullet', start='square', bulletFontName='Helvetica'))

            doc.build(story)
            pdf_bytes = buffer.getvalue()
            buffer.close()
            return pdf_bytes

        except Exception as e:
            logger.error(f"PDF generation failed, falling back to HTML: {e}")
            return cls.generate_html_report(session).encode("utf-8")

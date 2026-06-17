import re
import unittest

from processors.table_chunker import TableChunker


class TableChunkerContentPreservationTests(unittest.TestCase):
    def setUp(self):
        self.chunker = TableChunker(
            max_table_chars=20,
            target_table_chars=120,
            min_child_chars=20,
        )

    def _split_contents(self, raw_table):
        plain_content = self._plain(raw_table)

        element = {
            "type": "table_text",
            "page": 1,
            "element_index": 1,
            "content": plain_content,
            "raw_content": plain_content,
            "raw_table": raw_table,
            "markdown_table": "",
        }

        chunks = self.chunker.split_table_element(
            element,
            parent_chunk_id=1,
        )

        children = [
            chunk
            for chunk in chunks
            if chunk.get("type") == "table_text_child"
        ]

        content = "\n".join(
            chunk.get("content", "")
            for chunk in children
        )

        return content, children

    @staticmethod
    def _plain(raw_table):
        without_tags = re.sub(r"<[^>]+>", " ", raw_table)
        return re.sub(r"\s+", " ", without_tags).strip()

    def test_description_header_is_not_numeric_header(self):
        header = self.chunker._numeric_header_info(
            ["구분", "주요 내용"]
        )

        self.assertIsNone(header)

    def test_value_columns_are_still_numeric_header(self):
        header = self.chunker._numeric_header_info(
            ["항목", "기준값", "목표값"]
        )

        self.assertIsNotNone(header)

    def test_description_table_with_numbered_items_preserves_details(self):
        content, children = self._split_contents(
            """
            <table><tbody>
              <tr>
                <td>목표 및 방향</td>
                <td>전체 추진 배경과 방향을 설명한다</td>
              </tr>
              <tr>
                <td>구분</td>
                <td>주요 내용</td>
              </tr>
              <tr>
                <td>세부 전략</td>
                <td>
                  ① 첫 번째 전략의 상세 설명
                  ② 두 번째 전략의 상세 설명
                  ③ 세 번째 전략의 상세 설명
                </td>
              </tr>
            </tbody></table>
            """
        )

        self.assertIn("목표 및 방향", content)
        self.assertIn(
            "전체 추진 배경과 방향을 설명한다",
            content,
        )

        for expected in [
            "① 첫 번째 전략의 상세 설명",
            "② 두 번째 전략의 상세 설명",
            "③ 세 번째 전략의 상세 설명",
        ]:
            with self.subTest(expected=expected):
                self.assertIn(expected, content)

        standalone_header_children = [
            child
            for child in children
            if re.sub(
                r"\s+",
                " ",
                child.get("content", ""),
            ).strip() == "구분 주요 내용"
        ]

        self.assertEqual(standalone_header_children, [])

    def test_long_body_text_with_numeric_keywords_is_not_header(self):
        header = self.chunker._numeric_header_info(
            [
                "주요 설명",
                (
                    "프로그램 운영 결과 취업률은 향상되었고 "
                    "성과지표와 목표값 달성도에 대한 분석을 수행하였다. "
                    "참여율 95%와 후속 개선방안도 함께 검토하였다."
                ),
            ]
        )

        self.assertIsNone(header)

    def test_short_body_phrase_with_rate_keyword_is_not_header(self):
        header = self.chunker._numeric_header_info(
            [
                "구분",
                "취업률 향상 결과를 분석한다",
            ]
        )

        self.assertIsNone(header)

    def test_numeric_target_rationale_body_is_not_header(self):
        header = self.chunker._numeric_header_info(
            [
                "기준값 및 목표값 설정 근거",
                (
                    "기준값은 전년도 결과를 참고해 설정하였으며 "
                    "목표값과 달성률은 향후 운영 방향을 설명하기 위한 본문이다."
                ),
            ]
        )

        self.assertIsNone(header)

    def test_exact_numeric_headers_remain_supported(self):
        self.assertIsNotNone(
            self.chunker._numeric_header_info(
                ["항목", "기준값", "목표값"]
            )
        )

        self.assertIsNotNone(
            self.chunker._numeric_header_info(
                ["구분", "금액", "집행률"]
            )
        )

    def test_parenthetical_numeric_headers_remain_supported(self):
        header = self.chunker._numeric_header_info(
            [
                "지표명",
                "기준값(A)",
                "목푯값(B)",
                "실적값(C)",
                "달성도(C/B, %)",
            ]
        )

        self.assertIsNotNone(header)

    def test_year_axis_headers_remain_supported(self):
        header = self.chunker._numeric_header_info(
            [
                "지표명",
                "2022년",
                "2023년",
                "2024년",
            ]
        )

        self.assertIsNotNone(header)

    def test_period_axis_headers_remain_supported(self):
        self.assertIsNotNone(
            self.chunker._numeric_header_info(
                [
                    "지표명",
                    "1차년도",
                    "2차년도",
                    "3차년도",
                ]
            )
        )

        self.assertIsNotNone(
            self.chunker._numeric_header_info(
                [
                    "구분",
                    "1분기",
                    "2분기",
                    "3분기",
                    "4분기",
                ]
            )
        )

    def test_context_title_followed_by_numeric_headers_is_supported(self):
        header = self.chunker._numeric_header_info(
            [
                "연차별 재정투자 현황",
                "비목",
                "예산(A)",
                "집행(B)",
                "집행률(B/A, %)",
            ]
        )

        self.assertIsNotNone(header)

    def test_nested_table_preserves_parent_text_before_nested_rows(self):
        content, children = self._split_contents(
            """
            <table><tbody><tr><td>
              부모 설명문
              <table><tbody>
                <tr><td>내부 항목 1</td></tr>
                <tr><td>내부 항목 2</td></tr>
              </tbody></table>
            </td></tr></tbody></table>
            """
        )

        self.assertEqual(content.count("부모 설명문"), 1)
        self.assertEqual(content.count("내부 항목 1"), 1)
        self.assertEqual(content.count("내부 항목 2"), 1)
        self.assertLess(content.index("부모 설명문"), content.index("내부 항목 1"))
        self.assertLess(content.index("내부 항목 1"), content.index("내부 항목 2"))
        self.assertGreaterEqual(len(children), 1)

    def test_nested_table_preserves_outer_sibling_cell_order(self):
        content, _ = self._split_contents(
            """
            <table><tbody><tr>
              <td>상위 항목</td>
              <td>
                <table><tbody>
                  <tr><td>내부 항목</td></tr>
                </tbody></table>
              </td>
            </tr></tbody></table>
            """
        )

        self.assertEqual(content.count("상위 항목"), 1)
        self.assertEqual(content.count("내부 항목"), 1)
        self.assertLess(
            content.index("상위 항목"),
            content.index("내부 항목"),
        )

    def test_mixed_description_and_numeric_rows_preserve_both(self):
        content, _ = self._split_contents(
            """
            <table><tbody>
              <tr><td>설명형 행</td><td>사업 배경과 추진 목적을 먼저 설명한다</td></tr>
              <tr><td>항목</td><td>기준값</td><td>목표값</td></tr>
              <tr><td>A</td><td>100</td><td>120</td></tr>
            </tbody></table>
            """
        )

        self.assertIn("설명형 행", content)
        self.assertIn("사업 배경과 추진 목적을 먼저 설명한다", content)
        self.assertIn("A", content)
        self.assertIn("기준값: 100", content)
        self.assertIn("목표값: 120", content)

    def test_single_cell_first_row_is_preserved_as_content(self):
        content, _ = self._split_contents(
            """
            <table><tbody>
              <tr><td>상위 분류</td></tr>
              <tr><td>세부 내용</td></tr>
            </tbody></table>
            """
        )

        self.assertEqual(content.count("상위 분류"), 1)
        self.assertEqual(content.count("세부 내용"), 1)
        self.assertLess(
            content.index("상위 분류"),
            content.index("세부 내용"),
        )

    def test_description_row_with_numbers_is_not_removed_as_numeric_artifact(self):
        content, _ = self._split_contents(
            """
            <table><tbody>
              <tr><td>설명</td><td>2024년 목표는 120.5이고 달성률 95%를 기준으로 설명한다</td></tr>
              <tr><td>항목</td><td>기준값</td><td>목표값</td></tr>
              <tr><td>B</td><td>100</td><td>120</td></tr>
            </tbody></table>
            """
        )

        self.assertIn("2024년 목표는 120.5", content)
        self.assertIn("달성률 95%", content)
        self.assertIn("B", content)
        self.assertIn("목표값: 120", content)

    def test_first_row_with_meaningful_description_is_preserved(self):
        content, _ = self._split_contents(
            """
            <table><tbody>
              <tr>
                <td>목표 및 추진방향</td>
                <td>
                  ◎ 주요 목표
                  ① 첫 번째 목표를 추진한다
                  ② 두 번째 목표를 추진한다
                  ◎ 추진방향
                  - 교육과정을 개선한다
                  - 지원체계를 강화한다
                </td>
              </tr>
              <tr>
                <td>구분</td>
                <td>주요 내용</td>
              </tr>
              <tr>
                <td>세부 전략</td>
                <td>
                  ① 첫 번째 전략의 상세 설명
                  ② 두 번째 전략의 상세 설명
                </td>
              </tr>
            </tbody></table>
            """
        )

        for expected in [
            "목표 및 추진방향",
            "첫 번째 목표를 추진한다",
            "두 번째 목표를 추진한다",
            "교육과정을 개선한다",
            "지원체계를 강화한다",
        ]:
            with self.subTest(expected=expected):
                self.assertIn(expected, content)

    def test_pure_first_header_row_is_not_emitted_as_child(self):
        _, children = self._split_contents(
            """
            <table><tbody>
              <tr>
                <td>구분</td>
                <td>주요 내용</td>
              </tr>
              <tr>
                <td>세부 전략</td>
                <td>실제 세부 전략 설명</td>
              </tr>
            </tbody></table>
            """
        )

        child_content = "\n".join(
            child.get("content", "")
            for child in children
        )
        self.assertIn("실제 세부 전략 설명", child_content)

        standalone_header_children = [
            child
            for child in children
            if re.sub(
                r"\s+",
                " ",
                child.get("content", ""),
            ).strip() == "구분 주요 내용"
        ]
        self.assertEqual(standalone_header_children, [])

    def test_used_header_is_not_carried_into_next_independent_header(self):
        content, children = self._split_contents(
            """
            <table><tbody>
              <tr>
                <td>항목</td>
                <td>기준값</td>
                <td>목표값</td>
              </tr>
              <tr>
                <td>지표 A</td>
                <td>10</td>
                <td>20</td>
              </tr>
              <tr>
                <td>구분</td>
                <td>금액</td>
                <td>집행률</td>
              </tr>
              <tr>
                <td>사업비</td>
                <td>100</td>
                <td>90%</td>
              </tr>
            </tbody></table>
            """
        )

        self.assertIn("지표 A", content)
        self.assertIn("기준값: 10", content)
        self.assertIn("목표값: 20", content)
        self.assertIn("사업비", content)
        self.assertIn("금액: 100", content)
        self.assertIn("집행률: 90%", content)

        business_children = [
            child.get("content", "")
            for child in children
            if "사업비" in child.get("content", "")
        ]
        self.assertEqual(len(business_children), 1)
        self.assertNotIn("기준값 | 목표값", business_children[0])

    def test_schedule_rows_preserve_year_quarter_arrows_strategy_and_budget(self):
        content, _ = self._split_contents(
            """
            <table><tbody>
              <tr><td>구분</td><td>2023년</td><td>2024년</td></tr>
              <tr><td>분기</td><td>1분기</td><td>2분기</td></tr>
              <tr><td>세부전략 ①</td><td>→</td><td>→</td></tr>
              <tr><td>소요예산</td><td>360</td><td>360</td></tr>
            </tbody></table>
            """
        )

        for expected in [
            "2023년",
            "2024년",
            "1분기",
            "2분기",
            "세부전략 ①",
            "→",
            "소요예산",
            "360",
        ]:
            with self.subTest(expected=expected):
                self.assertIn(expected, content)


if __name__ == "__main__":
    unittest.main()

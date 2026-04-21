import XCTest
@testable import Capture

final class RedactionTests: XCTestCase {
    func testBuiltinRulesRedactCommonSecrets() {
        let redactor = Redactor(rules: BuiltinRedactionRules.all)
        let input = """
        Hit me up at alice@example.com, key sk-abcdef1234567890abcdef, \
        token ghp_abcdef1234567890abcdefghij, aws AKIAIOSFODNN7EXAMPLE
        """
        let out = redactor.apply(input)
        XCTAssertFalse(out.contains("alice@example.com"))
        XCTAssertFalse(out.contains("sk-abcdef"))
        XCTAssertFalse(out.contains("ghp_abcdef"))
        XCTAssertFalse(out.contains("AKIAIOSFODNN7EXAMPLE"))
        XCTAssertTrue(out.contains("[REDACTED_EMAIL]"))
        XCTAssertTrue(out.contains("[REDACTED_API_KEY]"))
        XCTAssertTrue(out.contains("[REDACTED_GH_TOKEN]"))
        XCTAssertTrue(out.contains("[REDACTED_AWS_AK]"))
    }

    func testDisabledRulesDoNotApply() {
        var rules = BuiltinRedactionRules.all
        rules = rules.map {
            var r = $0
            if r.pattern.contains("@") { r.enabled = false }
            return r
        }
        let redactor = Redactor(rules: rules)
        XCTAssertTrue(redactor.apply("x@y.com").contains("@"))
    }
}

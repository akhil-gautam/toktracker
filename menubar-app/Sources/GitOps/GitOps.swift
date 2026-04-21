import Foundation
import Core
import Storage

public struct GitAttribution: Sendable {
    public init() {}

    public func resolve(cwd: URL) -> (repo: String?, branch: String?) {
        var dir = cwd
        for _ in 0..<10 {
            let gitDir = dir.appendingPathComponent(".git")
            if FileManager.default.fileExists(atPath: gitDir.path) {
                return (readRepo(gitDir), readBranch(gitDir))
            }
            let parent = dir.deletingLastPathComponent()
            if parent == dir { break }
            dir = parent
        }
        return (nil, nil)
    }

    private func readRepo(_ gitDir: URL) -> String? {
        let configURL = gitDir.appendingPathComponent("config")
        guard let config = try? String(contentsOf: configURL) else { return nil }
        let pattern = #"url\s*=\s*([^\n]+)"#
        guard let match = config.range(of: pattern, options: .regularExpression) else { return nil }
        let url = String(config[match]).replacingOccurrences(of: "url = ", with: "").trimmingCharacters(in: .whitespaces)
        if let slashIdx = url.lastIndex(of: "/"),
           let colonIdx = url.range(of: ":", options: .backwards)?.lowerBound,
           slashIdx > colonIdx {
            let tail = url[colonIdx..<url.endIndex].dropFirst()
            return tail.replacingOccurrences(of: ".git", with: "")
        }
        return url
    }

    private func readBranch(_ gitDir: URL) -> String? {
        let headURL = gitDir.appendingPathComponent("HEAD")
        guard let head = try? String(contentsOf: headURL) else { return nil }
        return head.replacingOccurrences(of: "ref: refs/heads/", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

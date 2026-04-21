import Foundation
import NaturalLanguage
import Core

public struct Embedder: Sendable {
    public init() {}

    public func vector(for text: String) -> [Double]? {
        guard let embed = NLEmbedding.sentenceEmbedding(for: .english),
              let v = embed.vector(for: text) else { return nil }
        return v
    }

    public func similarity(_ a: String, _ b: String) -> Double {
        guard let va = vector(for: a), let vb = vector(for: b) else {
            return Self.hashSimilarity(a, b)
        }
        return Self.cosine(va, vb)
    }

    public static func cosine(_ a: [Double], _ b: [Double]) -> Double {
        guard a.count == b.count, !a.isEmpty else { return 0 }
        var dot = 0.0, na = 0.0, nb = 0.0
        for i in 0..<a.count {
            dot += a[i] * b[i]
            na += a[i] * a[i]
            nb += b[i] * b[i]
        }
        let denom = (na.squareRoot() * nb.squareRoot())
        return denom == 0 ? 0 : dot / denom
    }

    public static func hashSimilarity(_ a: String, _ b: String) -> Double {
        let setA = Set(tokens(a))
        let setB = Set(tokens(b))
        let intersection = setA.intersection(setB).count
        let union = setA.union(setB).count
        return union == 0 ? 0 : Double(intersection) / Double(union)
    }

    private static func tokens(_ s: String) -> [String] {
        s.lowercased()
         .components(separatedBy: CharacterSet.alphanumerics.inverted)
         .filter { $0.count >= 3 }
    }
}

// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Tokscale",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Tokscale", targets: ["Tokscale"]),
        .executable(name: "TokscaleHook", targets: ["TokscaleHook"]),
        .library(name: "Core", targets: ["Core"]),
        .library(name: "Storage", targets: ["Storage"]),
        .library(name: "Parsers", targets: ["Parsers"]),
        .library(name: "Capture", targets: ["Capture"]),
        .library(name: "Detection", targets: ["Detection"]),
        .library(name: "Embeddings", targets: ["Embeddings"]),
        .library(name: "GitOps", targets: ["GitOps"]),
        .library(name: "Scheduler", targets: ["Scheduler"]),
        .library(name: "Hook", targets: ["Hook"]),
        .library(name: "UI", targets: ["UI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.29.0"),
    ],
    targets: [
        .target(
            name: "Core",
            resources: [.copy("Resources/pricing.json")]
        ),
        .target(
            name: "Storage",
            dependencies: [
                "Core",
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            resources: [.copy("Resources/schema.sql")]
        ),
        .target(name: "Embeddings", dependencies: ["Core"]),
        .target(
            name: "Parsers",
            dependencies: [
                "Core", "Storage",
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
        .target(
            name: "Capture",
            dependencies: [
                "Core", "Storage", "Parsers",
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
        .target(
            name: "Detection",
            dependencies: [
                "Core", "Storage", "Embeddings",
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
        .target(
            name: "GitOps",
            dependencies: [
                "Core", "Storage",
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
        .target(
            name: "Scheduler",
            dependencies: [
                "Core", "Storage", "Detection",
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
        .target(name: "Hook", dependencies: ["Core", "Storage", "Detection"]),
        .target(
            name: "UI",
            dependencies: [
                "Core", "Storage", "Parsers", "Capture",
                "Detection", "Hook", "GitOps", "Scheduler",
                .product(name: "GRDB", package: "GRDB.swift"),
            ]
        ),
        .executableTarget(
            name: "Tokscale",
            dependencies: [
                "Core", "Storage", "Parsers", "Capture",
                "Detection", "Embeddings", "GitOps",
                "Scheduler", "Hook", "UI",
            ]
        ),
        .executableTarget(
            name: "TokscaleHook",
            dependencies: ["Core", "Storage", "Detection", "Hook"]
        ),
        .testTarget(name: "CoreTests", dependencies: ["Core"]),
        .testTarget(name: "StorageTests", dependencies: ["Storage"]),
        .testTarget(
            name: "ParsersTests",
            dependencies: ["Parsers", "Core"],
            resources: [.copy("Fixtures")]
        ),
        .testTarget(name: "CaptureTests", dependencies: ["Capture", "Storage", "Core", "Parsers"]),
        .testTarget(name: "DetectionTests", dependencies: ["Detection", "Storage", "Core"]),
        .testTarget(name: "HookTests", dependencies: ["Hook", "Storage", "Core"]),
    ]
)

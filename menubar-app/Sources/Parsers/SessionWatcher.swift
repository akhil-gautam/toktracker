import Foundation
import CoreServices

public final class SessionWatcher: @unchecked Sendable {
    public typealias Handler = @Sendable ([URL]) -> Void

    private var stream: FSEventStreamRef?
    private let queue = DispatchQueue(label: "tokscale.watcher", qos: .utility)
    private let handler: Handler
    private let paths: [URL]

    public init(paths: [URL], handler: @escaping Handler) {
        self.paths = paths
        self.handler = handler
    }

    public func start() {
        let cfPaths = paths.map { $0.path } as CFArray
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil)

        let callback: FSEventStreamCallback = { _, clientInfo, numEvents, eventPaths, _, _ in
            guard let clientInfo else { return }
            let watcher = Unmanaged<SessionWatcher>.fromOpaque(clientInfo).takeUnretainedValue()
            // With kFSEventStreamCreateFlagUseCFTypes set, eventPaths is a
            // CFArrayRef of CFString. Without it, it'd be a C array of C
            // strings — dereferencing those as Obj-C objects segfaults.
            let paths = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue()
            var urls: [URL] = []
            for i in 0..<numEvents {
                guard let raw = CFArrayGetValueAtIndex(paths, i) else { continue }
                let s = Unmanaged<CFString>.fromOpaque(raw).takeUnretainedValue() as String
                urls.append(URL(fileURLWithPath: s))
            }
            watcher.handler(urls)
        }

        let stream = FSEventStreamCreate(
            nil, callback, &context, cfPaths,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            1.0,
            UInt32(kFSEventStreamCreateFlagFileEvents
                   | kFSEventStreamCreateFlagNoDefer
                   | kFSEventStreamCreateFlagUseCFTypes))

        guard let stream else { return }
        FSEventStreamSetDispatchQueue(stream, queue)
        FSEventStreamStart(stream)
        self.stream = stream
    }

    public func stop() {
        guard let stream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        self.stream = nil
    }

    deinit { stop() }
}

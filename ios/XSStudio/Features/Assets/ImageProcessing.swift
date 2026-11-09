import Foundation
import UIKit
import Vision
import CoreImage

extension UIImage {
    /// Bakes EXIF orientation into pixels and caps the long edge (pixel scale 1).
    func normalized(maxDimension: CGFloat) -> UIImage {
        let pixelWidth = size.width * scale
        let pixelHeight = size.height * scale
        let longest = max(pixelWidth, pixelHeight)
        let ratio = longest > maxDimension ? maxDimension / longest : 1
        if imageOrientation == .up && ratio == 1 && scale == 1 { return self }
        let target = CGSize(width: floor(pixelWidth * ratio), height: floor(pixelHeight * ratio))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }
}

/// Converts picked photos (often HEIC) into upload-ready PNG/JPEG the server can process.
enum ImagePrep {
    struct Prepared {
        let data: Data
        let filename: String
        let mimeType: String
        let image: UIImage
    }

    static let maxDimension: CGFloat = 6000

    static func isPNG(_ data: Data) -> Bool {
        data.starts(with: [0x89, 0x50, 0x4E, 0x47])
    }

    static func prepare(_ data: Data) -> Prepared? {
        guard let image = UIImage(data: data) else { return nil }
        let id = UUID().uuidString.prefix(8).lowercased()
        let png = isPNG(data)
        let longest = max(image.size.width * image.scale, image.size.height * image.scale)
        if png && image.imageOrientation == .up && longest <= maxDimension {
            return Prepared(data: data, filename: "upload-\(id).png", mimeType: "image/png", image: image)
        }
        let normalized = image.normalized(maxDimension: maxDimension)
        if png, let pngData = normalized.pngData() {
            return Prepared(data: pngData, filename: "upload-\(id).png", mimeType: "image/png", image: normalized)
        }
        guard let jpeg = normalized.jpegData(compressionQuality: 0.93) else { return nil }
        return Prepared(data: jpeg, filename: "upload-\(id).jpg", mimeType: "image/jpeg", image: normalized)
    }
}

/// On-device subject lift (iOS 17 Vision) → transparent PNG cut-out.
enum SubjectLifter {
    enum LiftError: LocalizedError {
        case noSubject
        case unsupported
        case failed

        var errorDescription: String? {
            switch self {
            case .noSubject: return "No clear subject was found in this photo. Try a shot where the artist is well separated from the background."
            case .unsupported: return "Subject lifting isn't available on this device (it needs a recent iPhone; it does not run in the Simulator)."
            case .failed: return "The cut-out couldn't be created from this image."
            }
        }
    }

    static func lift(_ image: UIImage) async throws -> Data {
        try await Task.detached(priority: .userInitiated) {
            try SubjectLifter.liftSync(image)
        }.value
    }

    private static func liftSync(_ image: UIImage) throws -> Data {
        let prepared = image.normalized(maxDimension: 4096)
        guard let cgImage = prepared.cgImage else { throw LiftError.failed }
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
        } catch {
            throw LiftError.unsupported
        }
        guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
            throw LiftError.noSubject
        }
        let buffer: CVPixelBuffer
        do {
            buffer = try observation.generateMaskedImage(ofInstances: observation.allInstances, from: handler, croppedToInstancesExtent: true)
        } catch {
            throw LiftError.failed
        }
        let ciImage = CIImage(cvPixelBuffer: buffer)
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let output = context.createCGImage(ciImage, from: ciImage.extent),
              let png = UIImage(cgImage: output).pngData() else {
            throw LiftError.failed
        }
        return png
    }
}

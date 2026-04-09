import { respondWithJSON } from "./json";
import { randomBytes } from "node:crypto";
import { type ApiConfig } from "../config";
import { type BunRequest, type S3File } from "bun";
import { getBearerToken, validateJWT } from "../auth";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getVideo, updateVideo } from "../db/videos";
import { mediaTypeToExt } from "./assets";


export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {

  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  };

  const token = getBearerToken(req.headers);
  const userId = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userId);

  const videoMetadata = getVideo(cfg.db, videoId);

  if (!videoMetadata) throw new NotFoundError("Could not find the video");
  if (videoMetadata.userID !== userId) {
    throw new UserForbiddenError("The user provided is not the owner of the video");
  };

  const formData = await req.formData();
  const videoFile = formData.get("video");
  if (!(videoFile instanceof File)) {
    throw new BadRequestError("Video file is missing");
  };

  if (videoFile.size > cfg.maxSizeForVideoUpload) {
    throw new BadRequestError("Video file exceeds the maximum allowed size");
  };

  const mediaType = videoFile.type;
  if (!mediaType) {
    throw new BadRequestError("Missing Content-Type for video");
  }
  if (mediaType !== "video/mp4") {
    throw new BadRequestError("Video should be an image file");
  };

  const videoFileData = await videoFile.arrayBuffer();
  if (!videoFileData) {
    throw new Error("Error reading file data");
  }

  const extension = mediaTypeToExt(mediaType);
  const fileName = randomBytes(32).toString("hex");
  const fileNameWithExt = `${fileName}${extension}`;
  const videoFilePath = `/tmp/${fileNameWithExt}`;

  await Bun.write(videoFilePath, videoFileData);
  const s3VideoFile: S3File = cfg.s3Client.file(
    fileNameWithExt, {
      bucket: cfg.s3BucketName
    });
  
  const videoFileContent = Bun.file(videoFilePath);
  await s3VideoFile.write(videoFileContent, {
    type: mediaType
  });
  
  const videoFileUrl = `https://${cfg.s3BucketName}.s3.${cfg.s3Region}.amazonaws.com/${fileNameWithExt}`
  videoMetadata.videoURL = videoFileUrl;
  updateVideo(cfg.db, videoMetadata);

  await Bun.file(videoFilePath).delete();
  return respondWithJSON(200, videoMetadata);
};

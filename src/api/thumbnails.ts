import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  };

  const MAX_UPLOAD_SIZE = 10 << 20; // 10MB

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(
      `Thumbnail file exceeds the maximum allowed size of 10MB`,
    );
  }
  
  const mediaType = file.type;
  if (!mediaType) {
    throw new BadRequestError("Missing Content-Type for thumbnail");
  }

  const fileData = await file.arrayBuffer();
  
  const thumbnailBuffer = Buffer.from(fileData);
  const thumbnailString64 = thumbnailBuffer.toString("base64");
  const thumbnailDataUrl = `data:<${fileData}>;base64,${thumbnailString64}`

  if (!fileData) {
    throw new Error("Error reading file data");
  }

  const videoMetadata = getVideo(cfg.db, videoId);
  if (!videoMetadata){
    throw new NotFoundError("Could not find video");
  };

  if (videoMetadata.userID !== userID) {
    throw new UserForbiddenError("The user provided is not the owner of the video");
  };

  videoMetadata.thumbnailURL = thumbnailDataUrl;
  updateVideo(cfg.db, videoMetadata);

  return respondWithJSON(200, videoMetadata);
}

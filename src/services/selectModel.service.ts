import { logger } from "@/utils/logger";
import { selectModelPayload } from "@/validators/selectModel.validator";
import axios, { AxiosRequestConfig } from "axios";

export const selectModelService = async (
  data: selectModelPayload
): Promise<any> => {
  const apiUrl = process.env.SELECT_MODEL_ENDPOINT;
  const apiKey = process.env.SELECT_MODEL_TOKEN;
  try {
    logger.info("[selectModel] fetching select model");
    const config: AxiosRequestConfig = {
      method: "post",
      url: apiUrl,
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      data,
    };
    const result = await axios(config);
    const apiResponse = {
      message: "Models fetched successfully",
      data: result.data,
      statusCode: 200,
    };
    logger.info("[selectModel] fetched select model");
    return apiResponse;
  } catch (error) {
    logger.error("[selectModel] Error while fetching models: ", error);
    const apiResponse = {
      message: "Error while fetching models",
      data: null,
      StatusCodes: 500,
    };
    return apiResponse;
  }
};

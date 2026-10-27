"""统一异常与错误码映射。"""
from __future__ import annotations


class BizError(Exception):
    """业务异常基类。"""

    code = 1
    http_status = 400

    def __init__(self, message: str = "", code: int | None = None):
        self.message = message or self.default_message
        if code is not None:
            self.code = code
        super().__init__(self.message)

    @property
    def default_message(self) -> str:
        return "业务处理失败"


class ImageInvalidError(BizError):
    http_status = 400
    code = 1001
    default_message = "图像无效或无法解析"


class ModelNotReadyError(BizError):
    http_status = 503
    code = 1002
    default_message = "AI 模型未就绪，请稍后重试"


class SessionNotFoundError(BizError):
    http_status = 404
    code = 1003
    default_message = "课堂记录不存在"


class StudentNotFoundError(BizError):
    http_status = 404
    code = 1004
    default_message = "学生不存在"


class NotInAttendanceListError(BizError):
    http_status = 409
    code = 1005
    default_message = "该学生不在本课堂应到名单中"


class NoPermissionError(BizError):
    http_status = 403
    code = 1006
    default_message = "无权限执行该操作"


class AuthFailedError(BizError):
    http_status = 401
    code = 1007
    default_message = "认证失败，用户名或密码错误"


class RoleForbiddenError(BizError):
    http_status = 403
    code = 1008
    default_message = "角色无权限访问"


class MappingInvalidError(BizError):
    http_status = 400
    code = 1009
    default_message = "人脸库导入映射信息无效"


class AppealExistsError(BizError):
    http_status = 409
    code = 1010
    default_message = "已存在未处理的申诉"


class NotAbsentError(BizError):
    http_status = 400
    code = 1011
    default_message = "该记录非缺勤，无法申诉"


class NoDataError(BizError):
    http_status = 404
    code = 1012
    default_message = "暂无符合条件的数据"


class AppealNotFoundError(BizError):
    http_status = 404
    code = 1013
    default_message = "申诉不存在"


class SelfCheckinIdentityError(BizError):
    http_status = 400
    code = 1014
    default_message = "人脸识别失败或与登录身份不一致"


class AlreadyCheckedInError(BizError):
    http_status = 409
    code = 1015
    default_message = "本课堂已签到，请勿重复操作"


class CourseNotFoundError(BizError):
    http_status = 404
    code = 1016
    default_message = "课程不存在"


# 便于按需导入
ERROR_TYPES = [
    ImageInvalidError,
    ModelNotReadyError,
    SessionNotFoundError,
    StudentNotFoundError,
    NotInAttendanceListError,
    NoPermissionError,
    AuthFailedError,
    RoleForbiddenError,
    MappingInvalidError,
    AppealExistsError,
    NotAbsentError,
    NoDataError,
    AppealNotFoundError,
    SelfCheckinIdentityError,
    AlreadyCheckedInError,
    CourseNotFoundError,
]